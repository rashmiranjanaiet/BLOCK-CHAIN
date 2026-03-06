import bcrypt from "bcryptjs";
import cors from "cors";
import { randomInt } from "crypto";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import multer, { MulterError } from "multer";
import mongoose, { Model, Schema } from "mongoose";
import path from "path";

dotenv.config();

const app = express();
const apiPort = Number(process.env.API_PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI ?? "";
const jwtSecret = process.env.JWT_SECRET ?? "";
const allowedOrigins = (process.env.ALLOWED_ORIGIN ?? "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

if (!mongoUri) {
  throw new Error("MONGODB_URI is required.");
}

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required.");
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin) || localhostOriginPattern.test(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
  }),
);
app.use(express.json());

interface UserDocument extends mongoose.Document {
  email: string;
  passwordHash: string;
  walletAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    walletAddress: { type: String, required: false },
  },
  { timestamps: true },
);

const User: Model<UserDocument> =
  mongoose.models.User ?? mongoose.model<UserDocument>("User", userSchema);

interface OneTimeNoteDocument extends mongoose.Document {
  key: string;
  note?: string;
  attachmentData?: Buffer;
  attachmentMimeType?: string;
  attachmentOriginalName?: string;
  attachmentSizeBytes?: number;
  attachmentKind?: "image" | "video" | "document";
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const oneTimeNoteSchema = new Schema<OneTimeNoteDocument>(
  {
    key: { type: String, required: true, unique: true, index: true },
    note: { type: String, required: false, maxlength: 5000 },
    attachmentData: { type: Buffer, required: false },
    attachmentMimeType: { type: String, required: false },
    attachmentOriginalName: { type: String, required: false },
    attachmentSizeBytes: { type: Number, required: false },
    attachmentKind: {
      type: String,
      enum: ["image", "video", "document"],
      required: false,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: false },
  },
  { timestamps: true },
);

// Auto-clean old unused notes to keep storage low for free Mongo tiers.
oneTimeNoteSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const OneTimeNote: Model<OneTimeNoteDocument> =
  mongoose.models.OneTimeNote ?? mongoose.model<OneTimeNoteDocument>("OneTimeNote", oneTimeNoteSchema);

interface AuthenticatedRequest extends Request {
  userId?: string;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const walletRegex = /^0x[a-fA-F0-9]{40}$/;
const keyRegex = /^\d{16}$/;
const requestedMaxNoteFileMb = Number(process.env.NOTE_MAX_FILE_MB ?? 20);
const maxNoteFileMb =
  Number.isFinite(requestedMaxNoteFileMb) && requestedMaxNoteFileMb > 0 ? requestedMaxNoteFileMb : 20;
const maxNoteFileBytes = maxNoteFileMb * 1024 * 1024;
const acceptedDocumentMimeTypes = new Set([
  "application/octet-stream",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "application/zip",
  "application/x-rar-compressed",
]);
const acceptedImageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".heic"]);
const acceptedVideoExtensions = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"]);
const acceptedDocumentExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".zip",
  ".rar",
]);

const noteUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxNoteFileBytes,
  },
});

function generateOneTimeKey(): string {
  let key = "";
  for (let index = 0; index < 16; index += 1) {
    key += randomInt(0, 10).toString();
  }
  return key;
}

function getAttachmentKind(
  mimeType: string,
  originalName?: string,
): "image" | "video" | "document" | null {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (acceptedDocumentMimeTypes.has(mimeType)) {
    const extension = path.extname(originalName ?? "").toLowerCase();
    if (acceptedImageExtensions.has(extension)) {
      return "image";
    }
    if (acceptedVideoExtensions.has(extension)) {
      return "video";
    }
    return "document";
  }

  const extension = path.extname(originalName ?? "").toLowerCase();
  if (acceptedImageExtensions.has(extension)) {
    return "image";
  }
  if (acceptedVideoExtensions.has(extension)) {
    return "video";
  }
  if (acceptedDocumentExtensions.has(extension)) {
    return "document";
  }
  return null;
}

function createAuthToken(userId: string, email: string): string {
  return jwt.sign(
    {
      sub: userId,
      email,
    },
    jwtSecret,
    { expiresIn: "7d" },
  );
}

function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }

  const token = authHeader.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    req.userId = String(payload.sub);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !emailRegex.test(email)) {
      res.status(400).json({ error: "Valid email is required." });
      return;
    }

    if (!password || password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      res.status(409).json({ error: "Email already registered." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email: email.toLowerCase(), passwordHash });
    const token = createAuthToken(String(user._id), user.email);

    res.status(201).json({
      token,
      user: {
        email: user.email,
        walletAddress: user.walletAddress ?? "",
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    const token = createAuthToken(String(user._id), user.email);
    res.json({
      token,
      user: {
        email: user.email,
        walletAddress: user.walletAddress ?? "",
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", authMiddleware, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await User.findById(req.userId).select("email walletAddress");
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    res.json({
      user: {
        email: user.email,
        walletAddress: user.walletAddress ?? "",
      },
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/auth/wallet", authMiddleware, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { walletAddress } = req.body as { walletAddress?: string };

    if (!walletAddress || !walletRegex.test(walletAddress)) {
      res.status(400).json({ error: "Valid walletAddress is required." });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { walletAddress },
      { new: true, runValidators: true },
    ).select("email walletAddress");

    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    res.json({
      user: {
        email: user.email,
        walletAddress: user.walletAddress ?? "",
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/notes/create",
  authMiddleware,
  noteUpload.single("attachment"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { note } = req.body as { note?: string };
      const trimmedNote = (note ?? "").trim();
      const attachment = req.file;

      if (!trimmedNote && !attachment) {
        res.status(400).json({ error: "Add a note or upload one file." });
        return;
      }

      if (trimmedNote.length > 5000) {
        res.status(400).json({ error: "Note is too long. Max 5000 characters." });
        return;
      }

      let attachmentKind: "image" | "video" | "document" | undefined;
      if (attachment) {
        attachmentKind = getAttachmentKind(attachment.mimetype, attachment.originalname) ?? undefined;
        if (!attachmentKind) {
          res.status(400).json({
            error:
              "Unsupported file type. Use image/*, video/*, or document files like pdf/doc/docx/xls/xlsx/ppt/pptx/txt/zip/rar.",
          });
          return;
        }
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const key = generateOneTimeKey();
        try {
          await OneTimeNote.create({
            key,
            note: trimmedNote || undefined,
            attachmentData: attachment?.buffer,
            attachmentMimeType: attachment?.mimetype,
            attachmentOriginalName: attachment?.originalname,
            attachmentSizeBytes: attachment?.size,
            attachmentKind,
            createdBy: req.userId,
          });

          res.status(201).json({
            key,
            message: "One-time key created. It becomes invalid after first open.",
            attachment: attachment
              ? {
                  name: attachment.originalname,
                  mimeType: attachment.mimetype,
                  sizeBytes: attachment.size,
                  kind: attachmentKind,
                }
              : null,
          });
          return;
        } catch (error) {
          const duplicateKeyCode = (error as { code?: number }).code;
          if (duplicateKeyCode === 11000) {
            continue;
          }
          throw error;
        }
      }

      res.status(500).json({ error: "Could not generate unique key. Try again." });
    } catch (error) {
      next(error);
    }
  },
);

app.post("/api/notes/redeem", async (req, res, next) => {
  try {
    const { key } = req.body as { key?: string };
    const sanitizedKey = (key ?? "").trim();

    if (!keyRegex.test(sanitizedKey)) {
      res.status(400).json({ error: "Key must be exactly 16 digits." });
      return;
    }

    const oneTimeNote = await OneTimeNote.findOneAndDelete({ key: sanitizedKey }).select(
      "note createdAt attachmentData attachmentMimeType attachmentOriginalName attachmentSizeBytes attachmentKind",
    );
    if (!oneTimeNote) {
      res.status(404).json({ error: "Invalid or already used key." });
      return;
    }

    const attachmentBase64 = oneTimeNote.attachmentData
      ? Buffer.from(oneTimeNote.attachmentData).toString("base64")
      : "";

    res.json({
      note: oneTimeNote.note ?? "",
      consumed: true,
      createdAt: oneTimeNote.createdAt,
      attachment: oneTimeNote.attachmentData
        ? {
            name: oneTimeNote.attachmentOriginalName ?? "file",
            mimeType: oneTimeNote.attachmentMimeType ?? "application/octet-stream",
            sizeBytes: oneTimeNote.attachmentSizeBytes ?? 0,
            kind: oneTimeNote.attachmentKind ?? "document",
            base64: attachmentBase64,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/token/config", (_req, res) => {
  res.json({
    tokenAddress: process.env.VITE_TOKEN_ADDRESS ?? "",
    chainId: Number(process.env.VITE_CHAIN_ID ?? 80002),
  });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: `File too large. Max allowed is ${maxNoteFileMb}MB.` });
      return;
    }
    res.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof Error && error.message === "Not allowed by CORS") {
    res.status(403).json({ error: "Origin blocked by CORS." });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: "Internal server error.",
  });
});

async function start() {
  await mongoose.connect(mongoUri);
  app.listen(apiPort, () => {
    console.log(`API server running on http://localhost:${apiPort}`);
  });
}

start().catch((error) => {
  console.error("Failed to start API server", error);
  process.exit(1);
});

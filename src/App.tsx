import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import rashmiCoinAbi from "./abi/RashmiCoin.json";

type AuthMode = "login" | "register";

type AuthResponse = {
  token: string;
  user: {
    email: string;
    walletAddress?: string;
  };
};

type MeResponse = {
  user: {
    email: string;
    walletAddress?: string;
  };
};

type CreateNoteResponse = {
  key: string;
  message: string;
  attachment?: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    kind: "image" | "video" | "document";
  } | null;
};

type RedeemNoteResponse = {
  note: string;
  consumed: boolean;
  createdAt: string;
  attachment?: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    kind: "image" | "video" | "document";
    base64: string;
  } | null;
};

type DashboardView = "token" | "notes";

type OpenedAttachment = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: "image" | "video" | "document";
  url: string;
};

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const TOKEN_ADDRESS = import.meta.env.VITE_TOKEN_ADDRESS ?? "";
const TARGET_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 80002);
const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME ?? "Polygon Amoy";
const CHAIN_RPC_URL = import.meta.env.VITE_CHAIN_RPC_URL ?? "";
const CHAIN_CURRENCY_SYMBOL = import.meta.env.VITE_CHAIN_CURRENCY_SYMBOL ?? "POL";
const CHAIN_BLOCK_EXPLORER = import.meta.env.VITE_CHAIN_BLOCK_EXPLORER ?? "";

function shortAddress(value: string): string {
  if (!value) return "";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "shortMessage" in error) {
    return String((error as { shortMessage?: string }).shortMessage ?? "Unknown error");
  }
  return "Something went wrong.";
}

async function apiRequest<T>(
  path: string,
  method: string,
  body?: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }

  return payload;
}

async function apiFormRequest<T>(path: string, method: string, formData: FormData, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }

  return payload;
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const byteCharacters = atob(base64);
  const chunkSize = 1024;
  const byteArrays: Uint8Array[] = [];

  for (let offset = 0; offset < byteCharacters.length; offset += chunkSize) {
    const slice = byteCharacters.slice(offset, offset + chunkSize);
    const byteNumbers = new Array<number>(slice.length);

    for (let index = 0; index < slice.length; index += 1) {
      byteNumbers[index] = slice.charCodeAt(index);
    }

    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return URL.createObjectURL(new Blob(byteArrays, { type: mimeType }));
}

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiToken, setApiToken] = useState(() => localStorage.getItem("rsc_auth_token") ?? "");
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem("rsc_user_email") ?? "");
  const [savedWallet, setSavedWallet] = useState("");

  const [walletAddress, setWalletAddress] = useState("");
  const [tokenName, setTokenName] = useState("RashmiCoin");
  const [tokenSymbol, setTokenSymbol] = useState("RSC");
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [tokenBalance, setTokenBalance] = useState("0");

  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [burnAmount, setBurnAmount] = useState("");

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Set your token address in .env before connecting wallet.");
  const [activeView, setActiveView] = useState<DashboardView>("token");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteAttachmentFile, setNoteAttachmentFile] = useState<File | null>(null);
  const [generatedNoteKey, setGeneratedNoteKey] = useState("");
  const [redeemKey, setRedeemKey] = useState("");
  const [openedNote, setOpenedNote] = useState("");
  const [openedNoteAt, setOpenedNoteAt] = useState("");
  const [openedAttachment, setOpenedAttachment] = useState<OpenedAttachment | null>(null);
  const noteFileInputRef = useRef<HTMLInputElement | null>(null);

  const contractReady = TOKEN_ADDRESS && ethers.isAddress(TOKEN_ADDRESS);
  const isLoggedIn = Boolean(apiToken);

  const explorerContractUrl = useMemo(() => {
    if (!CHAIN_BLOCK_EXPLORER || !contractReady) {
      return "";
    }
    return `${CHAIN_BLOCK_EXPLORER.replace(/\/$/, "")}/address/${TOKEN_ADDRESS}`;
  }, [contractReady]);

  useEffect(() => {
    if (apiToken) {
      localStorage.setItem("rsc_auth_token", apiToken);
    } else {
      localStorage.removeItem("rsc_auth_token");
    }
  }, [apiToken]);

  useEffect(() => {
    if (userEmail) {
      localStorage.setItem("rsc_user_email", userEmail);
    } else {
      localStorage.removeItem("rsc_user_email");
    }
  }, [userEmail]);

  useEffect(() => {
    if (!apiToken) {
      return;
    }

    apiRequest<MeResponse>("/api/auth/me", "GET", undefined, apiToken)
      .then((response) => {
        setUserEmail(response.user.email);
        setSavedWallet(response.user.walletAddress ?? "");
      })
      .catch(() => {
        setApiToken("");
        setUserEmail("");
        setSavedWallet("");
      });
  }, [apiToken]);

  useEffect(() => {
    return () => {
      setOpenedAttachment((previous) => {
        if (previous?.url) {
          URL.revokeObjectURL(previous.url);
        }
        return null;
      });
    };
  }, []);

  async function ensureNetwork(provider: ethers.BrowserProvider): Promise<void> {
    const network = await provider.getNetwork();
    const currentChainId = Number(network.chainId);

    if (currentChainId === TARGET_CHAIN_ID) {
      return;
    }

    if (!window.ethereum) {
      throw new Error("MetaMask not found.");
    }

    const chainIdHex = `0x${TARGET_CHAIN_ID.toString(16)}`;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }],
      });
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 4902 && CHAIN_RPC_URL) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainIdHex,
              chainName: CHAIN_NAME,
              rpcUrls: [CHAIN_RPC_URL],
              nativeCurrency: {
                name: CHAIN_CURRENCY_SYMBOL,
                symbol: CHAIN_CURRENCY_SYMBOL,
                decimals: 18,
              },
              blockExplorerUrls: CHAIN_BLOCK_EXPLORER ? [CHAIN_BLOCK_EXPLORER] : undefined,
            },
          ],
        });
      } else {
        throw error;
      }
    }
  }

  async function loadWalletAndContract() {
    if (!window.ethereum) {
      throw new Error("MetaMask not detected. Install MetaMask first.");
    }

    if (!contractReady) {
      throw new Error("Set VITE_TOKEN_ADDRESS in .env to a deployed token contract.");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    await ensureNetwork(provider);

    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const contract = new ethers.Contract(TOKEN_ADDRESS, rashmiCoinAbi, signer);

    const [name, symbol, decimals, rawBalance] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
      contract.balanceOf(address),
    ]);

    setWalletAddress(address);
    setTokenName(name);
    setTokenSymbol(symbol);
    setTokenDecimals(Number(decimals));
    setTokenBalance(ethers.formatUnits(rawBalance, Number(decimals)));

    if (apiToken) {
      const response = await apiRequest<MeResponse>(
        "/api/auth/wallet",
        "PUT",
        { walletAddress: address },
        apiToken,
      );
      setSavedWallet(response.user.walletAddress ?? "");
    }
  }

  async function refreshBalance() {
    if (!window.ethereum || !walletAddress || !contractReady) {
      return;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(TOKEN_ADDRESS, rashmiCoinAbi, signer);
    const rawBalance = await contract.balanceOf(walletAddress);
    setTokenBalance(ethers.formatUnits(rawBalance, tokenDecimals));
  }

  function clearOpenedAttachment() {
    setOpenedAttachment((previous) => {
      if (previous?.url) {
        URL.revokeObjectURL(previous.url);
      }
      return null;
    });
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("Processing authentication...");
    try {
      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const response = await apiRequest<AuthResponse>(endpoint, "POST", { email, password });
      setApiToken(response.token);
      setUserEmail(response.user.email);
      setSavedWallet(response.user.walletAddress ?? "");
      setStatus(`${authMode === "register" ? "Registered" : "Logged in"} successfully.`);
      setPassword("");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleConnectWallet() {
    setBusy(true);
    setStatus("Connecting MetaMask...");
    try {
      await loadWalletAndContract();
      setStatus("Wallet connected and balance loaded.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.ethereum || !contractReady) return;

    setBusy(true);
    setStatus("Sending transfer transaction...");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(TOKEN_ADDRESS, rashmiCoinAbi, signer);
      const amount = ethers.parseUnits(transferAmount, tokenDecimals);
      const tx = await contract.transfer(transferTo, amount);
      await tx.wait();
      await refreshBalance();
      setTransferAmount("");
      setTransferTo("");
      setStatus(`Transfer successful. Tx hash: ${tx.hash}`);
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleMint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.ethereum || !contractReady) return;

    setBusy(true);
    setStatus("Sending mint transaction...");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(TOKEN_ADDRESS, rashmiCoinAbi, signer);
      const amount = ethers.parseUnits(mintAmount, tokenDecimals);
      const tx = await contract.mint(mintTo, amount);
      await tx.wait();
      await refreshBalance();
      setMintAmount("");
      setMintTo("");
      setStatus(`Mint successful. Tx hash: ${tx.hash}`);
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleBurn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.ethereum || !contractReady) return;

    setBusy(true);
    setStatus("Sending burn transaction...");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(TOKEN_ADDRESS, rashmiCoinAbi, signer);
      const amount = ethers.parseUnits(burnAmount, tokenDecimals);
      const tx = await contract.burn(amount);
      await tx.wait();
      await refreshBalance();
      setBurnAmount("");
      setStatus(`Burn successful. Tx hash: ${tx.hash}`);
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiToken) {
      setStatus("Login is required to create one-time note keys.");
      return;
    }

    if (!noteDraft.trim() && !noteAttachmentFile) {
      setStatus("Add a note or choose an image/video/document file.");
      return;
    }

    setBusy(true);
    setStatus("Creating one-time blockchain key...");
    try {
      const formData = new FormData();
      if (noteDraft.trim()) {
        formData.append("note", noteDraft.trim());
      }
      if (noteAttachmentFile) {
        formData.append("attachment", noteAttachmentFile);
      }

      const response = await apiFormRequest<CreateNoteResponse>("/api/notes/create", "POST", formData, apiToken);
      setGeneratedNoteKey(response.key);
      setOpenedNote("");
      setOpenedNoteAt("");
      clearOpenedAttachment();
      setNoteDraft("");
      setNoteAttachmentFile(null);
      if (noteFileInputRef.current) {
        noteFileInputRef.current.value = "";
      }
      if (response.attachment) {
        setStatus(
          `Key created: ${response.key}. File attached (${response.attachment.kind}, ${response.attachment.name}). Share once only.`,
        );
      } else {
        setStatus(`Key created: ${response.key}. Share it once only.`);
      }
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRedeemNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("Opening note with key...");
    try {
      const response = await apiRequest<RedeemNoteResponse>("/api/notes/redeem", "POST", {
        key: redeemKey,
      });
      setOpenedNote(response.note);
      setOpenedNoteAt(new Date(response.createdAt).toLocaleString());
      if (response.attachment?.base64) {
        const attachmentUrl = base64ToBlobUrl(response.attachment.base64, response.attachment.mimeType);
        setOpenedAttachment((previous) => {
          if (previous?.url) {
            URL.revokeObjectURL(previous.url);
          }
          return {
            name: response.attachment?.name ?? "file",
            mimeType: response.attachment?.mimeType ?? "application/octet-stream",
            kind: response.attachment?.kind ?? "document",
            sizeBytes: response.attachment?.sizeBytes ?? 0,
            url: attachmentUrl,
          };
        });
      } else {
        clearOpenedAttachment();
      }
      setGeneratedNoteKey("");
      setRedeemKey("");
      if (response.attachment) {
        setStatus("Note and file opened. This key is now invalid and deleted.");
      } else {
        setStatus("Note opened. This key is now invalid and deleted.");
      }
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    setApiToken("");
    setUserEmail("");
    setSavedWallet("");
    setWalletAddress("");
    setTokenBalance("0");
    setGeneratedNoteKey("");
    setNoteDraft("");
    setNoteAttachmentFile(null);
    if (noteFileInputRef.current) {
      noteFileInputRef.current.value = "";
    }
    setOpenedNote("");
    setOpenedNoteAt("");
    clearOpenedAttachment();
    setActiveView("token");
    setStatus("Logged out.");
  }

  function renderOpenedAttachment() {
    if (!openedAttachment) {
      return null;
    }

    return (
      <div className="attachment-view">
        <p>
          <strong>Attachment:</strong> {openedAttachment.name} ({openedAttachment.kind},{" "}
          {(openedAttachment.sizeBytes / (1024 * 1024)).toFixed(2)} MB)
        </p>
        {openedAttachment.kind === "image" && (
          <img className="attachment-image" src={openedAttachment.url} alt={openedAttachment.name} />
        )}
        {openedAttachment.kind === "video" && (
          <video className="attachment-video" controls src={openedAttachment.url} />
        )}
        <a className="download-link" href={openedAttachment.url} download={openedAttachment.name}>
          Download File
        </a>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="container">
        <header className="hero">
          <h1>RashmiCoin Token Dashboard</h1>
          <p>ERC-20 setup with MongoDB login, MetaMask wallet, and transfer/mint/burn actions.</p>
        </header>

        {isLoggedIn && (
          <section className="view-switch">
            <button
              type="button"
              className={activeView === "token" ? "active-switch" : ""}
              onClick={() => setActiveView("token")}
            >
              Token Dashboard
            </button>
            <button
              type="button"
              className={activeView === "notes" ? "active-switch" : ""}
              onClick={() => setActiveView("notes")}
            >
              2nd Dashboard (Notes)
            </button>
          </section>
        )}

        {!isLoggedIn ? (
          <div className="layout">
            <section className="panel">
              <div className="panel-title-row">
                <h2>{authMode === "register" ? "Create Account" : "Login"}</h2>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
                >
                  Switch to {authMode === "login" ? "Register" : "Login"}
                </button>
              </div>
              <form className="form-grid" onSubmit={handleAuthSubmit}>
                <label>
                  Email
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={busy}>
                  {busy ? "Please wait..." : authMode === "register" ? "Register" : "Login"}
                </button>
              </form>
            </section>

            <section className="panel">
              <h2>Receive Note (One-Time Key)</h2>
              <p>
                Paste a 16-digit key to open one-time content (note, image, video, or document). After first open,
                key is deleted.
              </p>
              <form className="form-grid" onSubmit={handleRedeemNote}>
                <label>
                  16-Digit Key
                  <input
                    type="text"
                    required
                    maxLength={16}
                    placeholder="1234567890123456"
                    value={redeemKey}
                    onChange={(event) => setRedeemKey(event.target.value.replace(/\D/g, "").slice(0, 16))}
                  />
                </label>
                <button type="submit" disabled={busy}>
                  Receive Note
                </button>
              </form>
              {(openedNote || openedAttachment) && (
                <div className="note-box">
                  <p>
                    <strong>Opened Note:</strong>
                  </p>
                  <p>{openedNote || "No text note. File-only message received."}</p>
                  {renderOpenedAttachment()}
                  {openedNoteAt && <p className="muted">Created at: {openedNoteAt}</p>}
                </div>
              )}
            </section>
          </div>
        ) : activeView === "token" ? (
          <div className="layout">
            <section className="panel">
              <h2>Account</h2>
              <p>
                Logged in as: <strong>{userEmail}</strong>
              </p>
              <p>
                DB Wallet: <strong>{savedWallet ? shortAddress(savedWallet) : "Not linked yet"}</strong>
              </p>
              <button type="button" onClick={handleLogout}>
                Logout
              </button>
            </section>

            <section className="panel">
              <h2>Wallet & Token</h2>
              <p>
                Token: {tokenName} ({tokenSymbol})
              </p>
              <p>Contract: {contractReady ? shortAddress(TOKEN_ADDRESS) : "Not configured"}</p>
              {explorerContractUrl && (
                <p>
                  Explorer:{" "}
                  <a href={explorerContractUrl} target="_blank" rel="noreferrer">
                    View Contract
                  </a>
                </p>
              )}
              <p>Target Chain ID: {TARGET_CHAIN_ID}</p>
              <p>Connected Wallet: {walletAddress ? shortAddress(walletAddress) : "Not connected"}</p>
              <p>
                Balance:{" "}
                <strong>
                  {Number(tokenBalance || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} {tokenSymbol}
                </strong>
              </p>
              <button type="button" onClick={handleConnectWallet} disabled={busy}>
                {walletAddress ? "Reconnect Wallet" : "Connect MetaMask"}
              </button>
              <button type="button" onClick={refreshBalance} disabled={busy || !walletAddress}>
                Refresh Balance
              </button>
            </section>

            <section className="panel">
              <h2>Transfer Tokens</h2>
              <form className="form-grid" onSubmit={handleTransfer}>
                <label>
                  To Wallet
                  <input
                    type="text"
                    required
                    placeholder="0x..."
                    value={transferTo}
                    onChange={(event) => setTransferTo(event.target.value)}
                  />
                </label>
                <label>
                  Amount
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={transferAmount}
                    onChange={(event) => setTransferAmount(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={busy || !walletAddress}>
                  Send Transfer
                </button>
              </form>
            </section>

            <section className="panel">
              <h2>Mint Tokens (Owner Only)</h2>
              <form className="form-grid" onSubmit={handleMint}>
                <label>
                  Recipient
                  <input
                    type="text"
                    required
                    placeholder="0x..."
                    value={mintTo}
                    onChange={(event) => setMintTo(event.target.value)}
                  />
                </label>
                <label>
                  Amount
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={mintAmount}
                    onChange={(event) => setMintAmount(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={busy || !walletAddress}>
                  Mint
                </button>
              </form>
            </section>

            <section className="panel">
              <h2>Burn Tokens</h2>
              <form className="form-grid" onSubmit={handleBurn}>
                <label>
                  Amount
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={burnAmount}
                    onChange={(event) => setBurnAmount(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={busy || !walletAddress}>
                  Burn
                </button>
              </form>
            </section>
          </div>
        ) : (
          <div className="layout">
            <section className="panel">
              <h2>Account</h2>
              <p>
                Logged in as: <strong>{userEmail}</strong>
              </p>
              <p>
                DB Wallet: <strong>{savedWallet ? shortAddress(savedWallet) : "Not linked yet"}</strong>
              </p>
              <button type="button" onClick={handleLogout}>
                Logout
              </button>
            </section>

            <section className="panel">
              <h2>Send Note</h2>
              <p>
                Write a note and/or upload one file (image, video, document), then click blockchain button to get a
                one-time 16-digit key.
              </p>
              <form className="form-grid" onSubmit={handleCreateNote}>
                <label>
                  Secret Note
                  <textarea
                    required
                    rows={5}
                    placeholder="Write your private note here..."
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                  />
                </label>
                <label>
                  Attachment (optional)
                  <input
                    ref={noteFileInputRef}
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                    onChange={(event) => setNoteAttachmentFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                {noteAttachmentFile && (
                  <p className="muted">
                    Selected: {noteAttachmentFile.name} ({(noteAttachmentFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
                )}
                <button type="submit" disabled={busy || (!noteDraft.trim() && !noteAttachmentFile)}>
                  Blockchain: Generate 16-Digit Key
                </button>
              </form>
              {generatedNoteKey && (
                <div className="note-box">
                  <p>
                    <strong>Your one-time key:</strong>
                  </p>
                  <p className="one-time-key">{generatedNoteKey}</p>
                  <p className="muted">Share this once. After one open, it becomes invalid.</p>
                </div>
              )}
            </section>

            <section className="panel">
              <h2>Receive Note</h2>
              <p>Paste the 16-digit key received from sender to open note/file exactly once.</p>
              <form className="form-grid" onSubmit={handleRedeemNote}>
                <label>
                  16-Digit Key
                  <input
                    type="text"
                    required
                    maxLength={16}
                    placeholder="1234567890123456"
                    value={redeemKey}
                    onChange={(event) => setRedeemKey(event.target.value.replace(/\D/g, "").slice(0, 16))}
                  />
                </label>
                <button type="submit" disabled={busy}>
                  Receive Note
                </button>
              </form>
              {(openedNote || openedAttachment) && (
                <div className="note-box">
                  <p>
                    <strong>Opened Note:</strong>
                  </p>
                  <p>{openedNote || "No text note. File-only message received."}</p>
                  {renderOpenedAttachment()}
                  {openedNoteAt && <p className="muted">Created at: {openedNoteAt}</p>}
                </div>
              )}
            </section>
          </div>
        )}

        <footer className="status">{status}</footer>
      </div>
    </div>
  );
}

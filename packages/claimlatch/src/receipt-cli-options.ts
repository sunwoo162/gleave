export interface ReceiptCliArguments {
  filePath: string;
  publicKeyPath?: string;
  json: boolean;
}

export function parseReceiptCliArguments(argv: string[]): ReceiptCliArguments {
  if (argv[0] !== "verify") throw new Error("Use `claimlatch-receipt verify --file <path>`." );

  let filePath: string | undefined;
  let publicKeyPath: string | undefined;
  let json = false;

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--file" || argument === "--public-key-file") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) throw new Error(`${argument} requires a value.`);
      if (argument === "--file") {
        if (filePath !== undefined) throw new Error("--file may only be specified once.");
        filePath = value;
      } else {
        if (publicKeyPath !== undefined) throw new Error("--public-key-file may only be specified once.");
        publicKeyPath = value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  if (!filePath) throw new Error("--file requires a value.");
  return {
    filePath,
    ...(publicKeyPath ? { publicKeyPath } : {}),
    json,
  };
}

export function renderReceiptHelp(): string {
  return [
    "ClaimLatch signed verification receipt tool",
    "",
    "Usage:",
    "  claimlatch-receipt verify --file <path> [--json]",
    "",
    "Commands:",
    "  verify                            Verify the receipt signature",
    "",
    "Options:",
    "  --file <path>                     Signed receipt JSON file",
    "  --public-key-file <path>          Trusted public key PEM file (optional)",
    "  --json                            Print machine-readable receipt, decision, and summary metadata",
    "  -h, --help                        Show this help",
    "",
    "Exit codes:",
    "  0  Receipt signature is valid",
    "  1  Receipt is invalid or signature verification failed",
    "  2  Usage or file error",
    "",
  ].join("\n");
}

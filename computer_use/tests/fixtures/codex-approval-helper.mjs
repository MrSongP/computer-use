import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin
});

rl.on("line", (line) => {
  const request = JSON.parse(line);

  if (request.method === "close" || request.method === "end_turn") {
    process.stdout.write(`${JSON.stringify({ id: request.id, ok: true, result: null })}\n`);
    if (request.method === "close") {
      rl.close();
    }
    return;
  }

  if (request.method === "launch_app") {
    process.stdout.write(`${JSON.stringify({
      id: request.id,
      ok: false,
      error: "Approval required to launch this application.",
      code: "approval_required",
      approvalRequest: {
        app: "admin.exe",
        displayName: "Admin Tool",
        riskLevel: "high"
      }
    })}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify({ id: request.id, ok: true, result: null })}\n`);
});

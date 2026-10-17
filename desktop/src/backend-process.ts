process.parentPort.on("message", ({ data }) => {
  if (data === "ping") {
    process.parentPort.postMessage("pong")
  }
})

console.log("[backend] Node iniciado.")

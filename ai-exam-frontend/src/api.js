export async function sendMessage(message) {
    const res = await fetch("http://localhost:5050/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: message })
    });
  
    return res.json();
  }
  
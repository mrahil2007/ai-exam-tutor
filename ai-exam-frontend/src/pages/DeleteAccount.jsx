import React from "react";

const DeleteAccount = () => {
  return (
    <div
      style={{
        fontFamily: "sans-serif",
        maxWidth: "600px",
        margin: "40px auto",
        padding: "20px",
        lineHeight: "1.6",
        color: "#333",
      }}
    >
      <h2 style={{ color: "#000" }}>Data Deletion & Account Closure Request</h2>
      <p>
        At ExamAI, we value your privacy. If you wish to delete your account and
        all associated data, you can do so through the following methods:
      </p>

      <h3>Method 1: In-App Deletion</h3>
      <p>
        1. Open the ExamAI app.
        <br />
        2. Go to the <b>Insights</b> or <b>Sidebar</b> menu.
        <br />
        3. Tap on <b>Settings</b> &gt; <b>Delete Account</b>.<br />
        4. Confirm your choice. All your data (chats, quiz history, and profile)
        will be wiped immediately.
      </p>

      <h3>Method 2: Web-Based Request</h3>
      <p>
        If you have uninstalled the app and want to delete your data, please
        email us at <b>support@examai-in.com</b> with the subject line "Account
        Deletion Request". Please include your registered email address.
      </p>

      <h3>What data will be deleted?</h3>
      <ul style={{ paddingLeft: "20px" }}>
        <li>Personal Profile (Name, Email, UID)</li>
        <li>Your AI Chat History</li>
        <li>Mock Test & Quiz Results</li>
        <li>Custom Flashcards & Study Plans</li>
      </ul>
      <p style={{ marginTop: "20px" }}>
        <i>Note: Data is usually removed within 48 hours of the request.</i>
      </p>
      <button
        onClick={() => (window.location.href = "/")}
        style={{ marginTop: 20, padding: "10px 20px", cursor: "pointer" }}
      >
        Back to Home
      </button>
    </div>
  );
};

export default DeleteAccount;

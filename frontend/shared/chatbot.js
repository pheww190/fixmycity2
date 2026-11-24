/* chatbot.js - Official AI Assistant Logic */

const chatbotHTML = `
  <div class="chatbot-widget">
    <button class="chatbot-button" id="chatBtn">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    </button>
    <div class="chatbot-window" id="chatWindow">
      <div class="chatbot-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 10px; height: 10px; background: #10B981; border-radius: 50%;"></div>
          <strong>AI SAATHI</strong>
        </div>
        <button id="closeChat" style="background: none; border: none; color: white; cursor: pointer;">✕</button>
      </div>
      <div class="chatbot-messages" id="chatMsgs">
        <div class="message bot-msg">Namaste! I am your AI Saathi. How can I help you today? You can report an issue or ask about your complaint status.</div>
      </div>
      <div class="chatbot-input">
        <input type="text" id="chatInput" placeholder="Type your message...">
        <button id="sendChat" style="background: var(--gov-blue); color: white; border: none; border-radius: 4px; padding: 0 12px; cursor: pointer;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>
  </div>
`;

function initChatbot() {
  document.body.insertAdjacentHTML('beforeend', chatbotHTML);
  
  const chatBtn = document.getElementById('chatBtn');
  const chatWindow = document.getElementById('chatWindow');
  const closeChat = document.getElementById('closeChat');
  const chatInput = document.getElementById('chatInput');
  const sendChat = document.getElementById('sendChat');
  const chatMsgs = document.getElementById('chatMsgs');

  chatBtn.onclick = () => {
    chatWindow.style.display = chatWindow.style.display === 'flex' ? 'none' : 'flex';
  };

  closeChat.onclick = () => {
    chatWindow.style.display = 'none';
  };

  function addMsg(text, type) {
    const msg = document.createElement('div');
    msg.className = `message ${type}-msg`;
    msg.textContent = text;
    chatMsgs.appendChild(msg);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
  }

  async function handleChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    addMsg(text, 'user');
    chatInput.value = '';

    // Enhanced AI Bot Logic
    setTimeout(() => {
      let reply = "I am trained to help with municipal issues. Could you please specify if it's about water, roads, electricity, or sanitation?";
      const lowerText = text.toLowerCase();
      
      if (lowerText.match(/(hello|hi|namaste|hey)/)) {
        reply = "Namaste! How can I assist you today? You can ask me how to file a complaint, check status, or ask about civic services.";
      } else if (lowerText.match(/(pothole|road|street|traffic|light)/)) {
        reply = "I see you're reporting a road or street infrastructure issue. Please login to your Citizen Portal and select 'Road & Infrastructure Department' to file a detailed grievance. You can even upload a geotagged photo!";
      } else if (lowerText.match(/(water|leak|supply|drainage|sewage|flood)/)) {
        reply = "Water and drainage issues are handled by the Water Supply Department. If it's urgent, please file a grievance immediately on our portal so officers can be dispatched.";
      } else if (lowerText.match(/(garbage|waste|trash|clean|sweep|sanitation|dump)/)) {
        reply = "Sanitation and waste management complaints are top priority. Please log in and submit a photo of the area so our cleaning crews can locate it exactly.";
      } else if (lowerText.match(/(power|electricity|wire|pole|current|blackout)/)) {
        reply = "Electricity hazards and power cuts should be reported to the Electricity Department. If it's a live wire hazard, please stay away and mark it as 'High Priority' when filing.";
      } else if (lowerText.match(/(status|track|where is my|progress|update)/)) {
        reply = "You can track your complaint status anytime. Just log in to your Citizen Portal and click 'My History' to see real-time updates from the assigned officers.";
      } else if (lowerText.match(/(register|login|how to file|create account)/)) {
        reply = "To file a complaint, you first need to register using your Aadhaar number. Click the 'Citizen Portal' link on the homepage to get started!";
      } else if (lowerText.match(/(thank|dhanyavad|great|good)/)) {
        reply = "You're very welcome! We are always here to help make our city better. Satyamev Jayate!";
      }
      
      addMsg(reply, 'bot');
    }, 800);
  }

  sendChat.onclick = handleChat;
  chatInput.onkeypress = (e) => {
    if (e.key === 'Enter') handleChat();
  };
}

document.addEventListener('DOMContentLoaded', initChatbot);

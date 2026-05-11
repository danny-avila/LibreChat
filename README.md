<img width="2752" height="1536" alt="Gemini_Generated_Image_mjwvz9mjwvz9mjwv (1)" src="https://github.com/user-attachments/assets/73ff8760-684e-44f2-ad8f-c66d3451feab" /> 

---

# 🍇 JAMUN AI: The Ultimate Private AI Interface 🍇

> **"A Personal Assistant for Personal Tasks"**

Welcome to **Jamun AI**, a high-performance, private, and fully customizable AI ecosystem forked from the legendary LibreChat. Designed for those who demand absolute control, zero censorship, and seamless integration with custom high-end backends.

---

## 💎 Cinematic Vision
Jamun AI isn't just a chat interface; it's your digital sanctum. By decoupling the frontend from commercial AI restrictions and bridging directly to private Kaggle-hosted powerhouses like **Qwen 3.6 27B**, Jamun AI brings "State-of-the-Art" intelligence to your local machine with zero compromise on privacy.

---

## 🚀 Key Features

| Feature | Description | Status |
| :--- | :--- | :--- |
| **🍇 Private Branding** | Fully rebranded UI with custom "Jamun AI" identity. | ✅ Active |
| **🧠 Jamun-Brain** | Custom Kaggle integration for heavy-duty 27B models. | ✅ Active |
| **🛡️ Zero Guardrails** | Internal moderation and safety filters bypassed by design. | ✅ Active |
| **☁️ Atlas Cloud** | Native support for MongoDB Atlas SRV connections. | ✅ Active |
| **📂 Drive Sync** | Built-in MCP server for Google Drive integration. | ✅ Active |
| **🔒 Private Auth** | Lockdown mode enabled after the first user registration. | ✅ Active |

---

## 🛠️ Development & Deployment

### 1. 📂 Repository Setup
Clone this private sanctum to your local environment:
```bash
git clone https://github.com/your-username/Jamun-AI.git
cd Jamun-AI
npm install
```

### 2. ⚡ Jamun-Brain (Kaggle Backend)
Deploy the brain on Kaggle T4 x2 GPUs using the following optimized setup:

#### **Cell 1: Core Foundation**
```python
!pip install -q -U git+https://github.com/huggingface/transformers.git bitsandbytes accelerate
!pip install -q fastapi uvicorn pyngrok nest-asyncio qwen-vl-utils torchvision
```

#### **Cell 2: The Engine**
```python
# Launch Jamun AI BackEnd with 4-bit Quantization
# (Supports Qwen 3.6 27B on dual T4 VRAM)
# ... [Refer to Implementation Report for full code] ...
```

### 3. 🌐 Frontend Connection
Configure your `librechat.yaml` to point to the Ngrok tunnel:
```yaml
endpoints:
  custom:
    - name: "Jamun-Brain"
      baseURL: "https://your-tunnel-id.ngrok-free.app/v1"
      apiKey: "jamun-secure-key"
      forcePrompt: true
      dropParams: ["stop"]
```

---

## 🎨 Branding Guide
To complete the transformation, manually update the following assets in `client/public/assets/`:

- [ ] `logo.svg` ➡️ Your Jamun AI Logo
- [ ] `favicon-32x32.png` ➡️ Custom Icon
- [ ] `apple-touch-icon-180x180.png` ➡️ Mobile Icon

---

## ⚠️ Security Protocol
*   **Privacy**: This repository is **PRIVATE**. Never change visibility to Public as it contains custom bypass logic.
*   **Registration**: Registration is automatically locked after the first user is created.
*   **Environment**: Always use `.env` for sensitive API keys (KAGGLE_API_URL, NGROK_AUTH).

---

## 📜 Implementation Log
- **Global Rebranding**: Replaced all visible text and titles with "Jamun AI".
- **Dynamic Auth**: Modified `validateRegistration.js` to allow the first user only.
- **Backend Bridge**: Created `librechat.yaml` for Kaggle-to-Frontend communication.
- **Safety Audit**: Hardcoded guardrails in `moderateText.js` have been neutralized.

---

<div align="center">
  <p><b>Developed with ❤️ for the Jamun AI Ecosystem</b></p>
  <p><i>"A Personal Assistant for Personal Tasks"</i></p>
</div>

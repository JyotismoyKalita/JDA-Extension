# JDA Extension (Jyotismoy's Download Accelerator)

The official browser companion for **JDA**, a high-performance download accelerator built with Rust and Tauri. This extension intercepts browser-managed downloads and seamlessly redirects them to the JDA desktop application for multi-threaded acceleration.

## Features

* **Smart Interception:** Automatically catches download requests and hands them over to the JDA desktop client.
* **On/Off Toggle:** A simple popup interface to enable or disable acceleration on the fly.
* **Deep Link Integration:** Communicates with the JDA app using the custom `jda://` protocol.
* **Persistence:** Remembers your preferences across browser sessions using `chrome.storage`.

## Installation

### For Developers (Unpacked)

1. Clone this repository.
2. Open Chrome/Edge and navigate to `chrome://extensions`.
3. Enable **Developer Mode** in the top right corner.
4. Click **Load unpacked** and select the `src` folder.

### For Users

*Coming soon to the Chrome Web Store.*

## Project Structure

```text
.
├── .gitignore
├── README.md
├── LICENSE
└───src/
    ├── background.js
    ├── manifest.json
    ├── popup.css
    ├── popup.html
    ├── popup.js
    └───icons/
        └── icon128.png
```  

## Author

Jyotismoy Kalita

## License

MIT License

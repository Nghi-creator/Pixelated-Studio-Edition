<p align="center">
  <img src="assets/banner.png" alt="Hermes Agent" width="100%">
</p>

# PIXELATED Studio

<p align="center">
  <a href="https://github.com/Nghi-creator/Pixelated-Studio-Edition/blob/main/assets/Pixelated.png"><img src="https://img.shields.io/badge/Architecture Diagram-red?style=for-the-badge" alt="Architecture Diagram"></a>
  <a href="https://github.com/Nghi-creator/Pixelated-Studio-Edition/blob/publishing/LICENSE.txt"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License: MIT"></a>
  <a href="https://www.linkedin.com/in/nicholas-nguyen-3bb17a335/"><img src="https://img.shields.io/badge/Built%20by-Nicholas Nguyen%20-blueviolet?style=for-the-badge" alt="Built by Nicholas"></a>
  <a href="https://dev.to/dashboard"><img src="https://img.shields.io/badge/Dev-Post-green?style=for-the-badge" alt="Dev Post"></a>
</p>

## ⚖️ Acknowledgments & copyright disclaimer

**PIXELATED Studio does not claim ownership of any third-party games featured in the public library.** The 8-bit games provided on this platform are works created by indie homebrew developers within the retro gaming community (many of which are sourced from itch.io). These titles are included strictly for educational, demonstrative, and testing purposes to showcase the capabilities of the platform's web emulation and cloud infrastructure.

Full credit, copyright, and intellectual property rights remain entirely with the original authors. We have attached the original authors' names to their respective titles, and we highly encourage all players to support the creators by searching for them, playing their other games, and supporting their work directly.

_If you are the original developer of a featured game and would like it removed from the PIXELATED public library, please open a GitHub Issue or contact the repository owner, and it will be handled immediately._

## 🌟 Overview

**An experiment with true cloud-gaming infrastructure.** PIXELATED Studio is not a standard web emulator like the user version, it is a distributed streaming pipeline. This edition aims at leveraging the use of webrtc, dockerization, and pipelines to implement a much more robust system than a web emulattor.

You can run the product locally, or drop the container onto a DigitalOcean droplet, AWS EC2, or serverless infrastructure to host your own public gaming node. No local emulation required.

|                             |                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Frame-perfect**           | Games run via compiled C++ Libretro cores (Mesen) natively within a headless Ubuntu environment so they bypass JavaScript garbage-collection bottlenecks entirely.                               |
| **True cloud architecture** | Mimics enterprise pipelines like GeForce Now or Stadia. The client doesn't render game logic but merely decodes a lightweight WebRTC video stream and transmits bidirectional socket keystrokes. |
| **Audio/Video Pipeline**    | Utilizes **Xvfb** (Virtual Framebuffer) and **PulseAudio** bridged through a GStreamer relay. Encodes raw frames into VP8 video and Opus audio with sub-50ms latency.                            |
| **Multi-device routing**    | Because the state is maintained server-side in the container, the WebRTC stream can be broadcast across a local network, allowing seamless session handoffs among multiple devices.              |
| **Hardware Agnostic**       | Decouples emulation complexity from client hardware limitations. Play demanding, perfectly synced games on heavily constrained low-end devices by offloading computation to the Docker host.     |

---

## 🌟 PIXELATED Studio desktop app

PIXELATED Studio is distributed as a standalone, pre-packaged desktop application. You do not need to compile the source code to use it.

## Install and use the desktop app

### Prerequisites

**Crucial:** This application orchestrates a headless Linux emulation environment, so you will need a container engine running on your host machine.

- Install **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** and ensure it is actively running.
- _(Windows Users)_: Ensure WSL2 or Hyper-V is enabled in your Docker settings.

### Download

Go to **[Releases](https://github.com/Nghi-creator/Pixelated-Studio-Edition/releases)** page and install the latest version.

- **Windows:** Download the `.exe` and double-click to install.
- **macOS:** Download the `.dmg` and drag it to your Applications folder. _(Note: If Apple Gatekeeper blocks the app, right-click the app icon and select "Open")._
- **Linux:** Download the `.AppImage`. Right-click the file, go to Properties -> Permissions, and check "Allow executing file as program".

### Booting the Orchestrator

1. Open the PIXELATED Studio application.
2. Click **Initialize Engine**.
3. The app will autonomously build the `ubuntu:22.04` container, compile the native engines, mount the WebRTC orchestrator, and establish the socket connections.
4. Wait for the engine status to turn **Green**, and your local streaming node is ready.

## 🌟 Pixelated Studio web app

The PIXELATED Studio web application is the interactive website with community-driven features, allowing you to experience the product effectively after booting up your PIXELATED Studio desktop application.

## Use the web app

After successfully booting the PIXELATED's desktop application, simply go to PIXELATED's Web application at **[PIXELATED](https://pixelated-studio-edition.vercel.app/)** to enjoy all features that the product has to offer

## Hosted Deploy Gate

Before a Render API or Vercel web deploy, run the repository-level gate:

```sh
STAGING_API_URL=https://pixelated-api-services.onrender.com \
STAGING_SUPABASE_URL=<supabase-project-url> \
STAGING_SUPABASE_ANON_KEY=<supabase-anon-key> \
STAGING_SMOKE_EMAIL=<dedicated-staging-admin-email> \
STAGING_SMOKE_PASSWORD=<dedicated-staging-admin-password> \
npm run predeploy:hosted
```

GitHub Actions runs local API contract checks on pull requests. On `main`
pushes, `.github/workflows/hosted-deploy.yml` calls the reusable hosted gate and
only triggers the Render API and Vercel web deploy hooks after the real hosted
predeploy checks pass. After both hooks run, it waits for a new ready Render API
process and a new Vercel production pairing bundle, then signs in, redeems a
one-use ticket through the real desktop HTTPS companion, checks Render pairing
restore and cloud-session verification, and uploads the smoke artifact bundle.
It then runs a focused hosted auth regression against throwaway users to prove
signup verification, resend cooldown, recovery redirects, password update, and
the committed five-minute expiry contract. See
`.context/backend-hosting-checklist.md` for the required staging and production
environment secrets and provider setup.

## Pixelated Studio web app's features

Once connected to your local desktop app, the web app acts as a developer sandbox and social platform. Just like the lightweight user edition, The studio version also provides core features of an experimental cloud-gamning and social-media platform, including:

### 🚀 Joint features, different goals

These are the features offered to both the Studio and User versions.

Game player: You will be able to play available games on the web and games from rom files that you upload to local vault. However the key difference is that the Studio version utilizes **_WebRTC Streaming_**, an intricate yet powerful game streaming tool. This ensuring a 1:1 testing environment for network latency.

Game library: You can also add one of your favorite games from our game database to your favorite-game library.

Social Hub: All social features that apply to the User edition applies to this version. That means, as a developer, you can leave feedback on other developers' projects via the commenting system, use the Like/Dislike ratio to gauge player reception, and engage in meaningful conversations within the community.

Local Vault: Need to test a build before showing the world? The Local Vault allows you to drag-and-drop ROMs directly from your hard drive into the web player, meaning one great purpose of the local vault is to allow you, a developer to upload your own games and playtest it before you are ready to publish it to any other platform (not just PIXELATED).

### 🚀 Studio's exclusive feature

Game Publishing: Developers can file a form to upload their compiled .nes ROMs directly to the public database, add custom cover arts, banners, admins of the page will instantly receive the message via email, allowing them to review and pubish your games to the website if everything is verified.

#### ⚠️ _Disclaimer: Only use this feature to publish games that you develop, any act of trying to request an upload of a copyrighted game that isn't made by you will be dismissed and can lead to a ban if you keep abusing the platform._

---

## The vision & the greater purpose

PIXELATED Studio is an experiment built to celebrate creators and test the boundaries of decentralized infrastructure.

1. A Sandbox for the 8-Bit devs
   Modern retro-development (homebrew) is thriving, but distribution remains incredibly friction-heavy. This platform gives developers a modern, frictionless ecosystem to build, test network behaviors, and share their games within a dedicated, supportive community.

2. Leverage the power of the Cloud Gaming blueprint
   Cloud gaming (like GeForce Now or Xbox Cloud) is rapidly becoming the future of the industry, but as of late, it still requires massive, centralized, and expensive enterprise server farms.

While PIXELATED Studio currently utilizes lightweight CPU emulation to run 8-bit games, the underlying architecture is completely hardware-agnostic. The pipeline we built here, which is spinning up an isolated container, capturing a headless frame buffer, encoding it via GStreamer, and routing it through WebRTC, is the same blueprint required for AAA cloud gaming.

That being said, this project serves a greater purpose than just being an a 8-bit cloud-gaming platform, it acts as a foundational showcase for cloud gaming in the future. If a GPU-accelerated 3D engine is finally integrated, this exact infrastructure would hold to power to allow anyone to host and stream heavy, high-fidelity games affordably across a decentralized network.

---

## Community

- **Link to the User edition:** [PIXELATED User edtion](https://github.com/Nghi-creator/Pixelated-User-Edition)
- **Dev post:** [Dev.to Nicholas](https://dev.to/nicholasthegreat)
- **LinkedIn:** [Linkedin Nicholas](https://www.linkedin.com/in/nicholas-nguyen-3bb17a335/)
- **Email:** [Mail Nicholas](mailto:gianghi30032005@gmail.com)

---

## License

MIT — see [LICENSE](LICENSE).

Built by [Nicholas Nguyen](https://www.linkedin.com/in/nicholas-nguyen-3bb17a335/).

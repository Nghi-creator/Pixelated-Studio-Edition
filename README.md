<p align="center">
  <img src="assets/banner.png" alt="Hermes Agent" width="100%">
</p>

# PIXELATED Studio

<p align="center">
  <a href="https://github.com/Nghi-creator/Pixelated-Studio-Edition/blob/main/assets/Pixelated.png"><img src="https://img.shields.io/badge/Architecture Diagram-purple?style=for-the-badge"></a>
  <a href="https://github.com/Nghi-creator/Pixelated-Studio-Edition/blob/publishing/LICENSE.txt"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License: MIT"></a>
  <a href="https://www.linkedin.com/in/nicholas-nguyen-3bb17a335/"><img src="https://img.shields.io/badge/Built%20by-Nicholas Nguyen%20-blueviolet?style=for-the-badge" alt="Built by Nous Research"></a>
</p>

## Overview

**An experimental, containerized cloud-gaming orchestrator built for retro game development.** PIXELATED Studio is not a standard web emulator—it is a distributed streaming pipeline. It spins up an isolated, headless Linux container to run C++ emulation cores natively, dynamically encodes the A/V output, and streams it to a React client via WebRTC.

Run it locally to benchmark network latency, or drop the container onto a $5 DigitalOcean droplet, AWS EC2, or serverless infrastructure to host your own zero-friction public gaming node. No local emulation required.

|                                    |                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frame-Perfect Native Emulation** | Bypasses JavaScript garbage-collection bottlenecks entirely. Games run via compiled C++ Libretro cores (Mesen/FCEUmm) natively within a headless Ubuntu environment.                              |
| **True Cloud Architecture**        | Mimics enterprise pipelines like GeForce Now or Stadia. The client renders zero game logic; it merely decodes a lightweight WebRTC video stream and transmits bidirectional socket keystrokes.    |
| **Real-time A/V Pipeline**         | Utilizes **Xvfb** (Virtual Framebuffer) and **PulseAudio** bridged through a Python/GStreamer relay. Encodes raw frames into VP8 video and Opus audio on the fly with sub-50ms latency.           |
| **Multi-Device Routing**           | Because the state is maintained server-side in the container, the WebRTC stream can be broadcast across a local network, allowing seamless session handoffs between a desktop and a mobile phone. |
| **Network Simulation**             | Allows 8-bit homebrew developers to benchmark exactly how their games respond to network latency, packet loss, and remote input polling before commercial deployment.                             |
| **Hardware Agnostic**              | Decouples emulation complexity from client hardware limitations. Play demanding, perfectly synced games on heavily constrained low-end devices by offloading computation to the Docker host.      |

---

## Install and use

```bash
curl -fsSL | bash
```

Works on Linux, macOS, and WSL2.

---

## Getting Started

```bash

```

📖 **[Full documentation →]()**

---

## Documentation

---

## Contributing

---

## Community

---

## License

MIT — see [LICENSE](LICENSE).

Built by [Nicholas Nguyen](https://www.linkedin.com/in/nicholas-nguyen-3bb17a335/).

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# 1. Download Core Tools
RUN apt-get update && apt-get install -y \
    software-properties-common \
    wget \
    curl \
    unzip \
    xvfb \
    xdotool \
    gstreamer1.0-tools \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-base \
    gstreamer1.0-pulseaudio \
    pulseaudio \
    python3 \
    python3-pip \
    python3-gi \
    python3-gst-1.0 \
    gir1.2-gst-plugins-bad-1.0 \
    gir1.2-gst-plugins-base-1.0 \
    gstreamer1.0-nice \
    && pip3 install "python-socketio[client]" \
    && rm -rf /var/lib/apt/lists/*

RUN usermod -aG pulse-access root

# 2. Install RetroArch and C++ Build Tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    retroarch \
    build-essential \
    git \
    g++ \
    make \
    ca-certificates

# 3. Forge the Native ARM64 NES Core from Source Code (Mesen)
RUN git clone --depth 1 https://github.com/libretro/mesen.git /tmp/mesen && \
    cd /tmp/mesen/Libretro && \
    make -j4 && \
    mkdir -p /cores && \
    cp mesen_libretro.so /cores/ && \
    rm -rf /tmp/mesen

# 4. Install Node.js 
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# 5. Set up server
WORKDIR /app

RUN npm install express socket.io cors
RUN mkdir -p /roms

COPY app_server/package*.json ./
RUN npm install
COPY app_server/ .

CMD ["node", "server.js"]
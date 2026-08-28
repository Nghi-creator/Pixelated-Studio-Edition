ARG UBUNTU_IMAGE=ubuntu:22.04@sha256:2edbbc5dc405e9612ba3584ce95480277e3eb374407b5505fe26f17df77c7dbc
ARG NODE_IMAGE=node:24.18.1-bullseye-slim@sha256:0527cf34f5753822dd7b0e6fd84cc2e81d9d10d60bed88af4dd7efb870317c6b

FROM ${UBUNTU_IMAGE} AS mesen-builder

ARG MESEN_REF=0102910c39ad1a62bc3f784466f3f67ca9eae335
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    g++ \
    git \
    make \
    && rm -rf /var/lib/apt/lists/*

RUN git init /tmp/mesen && \
    git -C /tmp/mesen remote add origin https://github.com/libretro/mesen.git && \
    git -C /tmp/mesen fetch --depth 1 origin "${MESEN_REF}" && \
    git -C /tmp/mesen checkout --detach FETCH_HEAD && \
    make -C /tmp/mesen/Libretro -j4 && \
    mkdir -p /out && \
    cp /tmp/mesen/Libretro/mesen_libretro.so /out/

FROM ${UBUNTU_IMAGE} AS mgba-builder

ARG MGBA_REF=26b7884bc25a5933960f3cdcd98bac1ae14d42e2
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    cmake \
    g++ \
    gcc \
    git \
    make \
    pkg-config \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN git init /tmp/mgba && \
    git -C /tmp/mgba remote add origin https://github.com/mgba-emu/mgba.git && \
    git -C /tmp/mgba fetch --depth 1 origin "${MGBA_REF}" && \
    git -C /tmp/mgba checkout --detach FETCH_HEAD && \
    cmake -S /tmp/mgba -B /tmp/mgba/build \
      -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_LIBRETRO=ON \
      -DBUILD_QT=OFF \
      -DBUILD_SDL=OFF \
      -DBUILD_SHARED=OFF \
      -DUSE_DEBUGGERS=OFF \
      -DUSE_DISCORD_RPC=OFF \
      -DUSE_EDITLINE=OFF \
      -DUSE_ELF=OFF \
      -DUSE_FFMPEG=OFF \
      -DUSE_LIBZIP=OFF \
      -DUSE_LUA=OFF \
      -DUSE_LZMA=OFF \
      -DUSE_MINIZIP=OFF \
      -DUSE_PNG=OFF \
      -DUSE_SQLITE3=OFF && \
    cmake --build /tmp/mgba/build --target mgba_libretro -j4 && \
    mkdir -p /out && \
    find /tmp/mgba/build -name mgba_libretro.so -exec cp {} /out/ \;

FROM ${UBUNTU_IMAGE} AS bsnes-builder

ARG BSNES_REF=ac0b6b1fe5cb9448492f4c6b3d815205eefbd142
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    g++ \
    git \
    make \
    && rm -rf /var/lib/apt/lists/*

RUN git init /tmp/bsnes-mercury && \
    git -C /tmp/bsnes-mercury remote add origin https://github.com/libretro/bsnes-mercury.git && \
    git -C /tmp/bsnes-mercury fetch --depth 1 origin "${BSNES_REF}" && \
    git -C /tmp/bsnes-mercury checkout --detach FETCH_HEAD && \
    make -C /tmp/bsnes-mercury -j4 platform=unix PROFILE=performance && \
    mkdir -p /out && \
    cp /tmp/bsnes-mercury/bsnes_mercury_performance_libretro.so /out/bsnes_libretro.so && \
    test -s /out/bsnes_libretro.so

FROM ${UBUNTU_IMAGE} AS picodrive-builder

ARG PICODRIVE_REF=f0d4a0118a9733a1f10bce5a4ac772c474f9300d
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    gcc \
    g++ \
    git \
    make \
    && rm -rf /var/lib/apt/lists/*

RUN git init /tmp/picodrive && \
    git -C /tmp/picodrive remote add origin https://github.com/libretro/picodrive.git && \
    git -C /tmp/picodrive fetch --depth 1 origin "${PICODRIVE_REF}" && \
    git -C /tmp/picodrive checkout --detach FETCH_HEAD && \
    git -C /tmp/picodrive submodule update --init --depth 1 --recursive && \
    make -C /tmp/picodrive -f Makefile.libretro -j4 platform=unix && \
    mkdir -p /out && \
    cp /tmp/picodrive/picodrive_libretro.so /out/ && \
    test -s /out/picodrive_libretro.so

FROM ${UBUNTU_IMAGE} AS python-builder

ENV DEBIAN_FRONTEND=noninteractive

COPY python-requirements.lock /tmp/python-requirements.lock

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip \
    && pip3 install --no-cache-dir --target /out -r /tmp/python-requirements.lock \
    && rm -rf /var/lib/apt/lists/*

FROM ${NODE_IMAGE} AS app-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY server.ts tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM ${UBUNTU_IMAGE} AS runtime

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
    gir1.2-gst-plugins-bad-1.0 \
    gir1.2-gst-plugins-base-1.0 \
    gstreamer1.0-nice \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-pulseaudio \
    gstreamer1.0-tools \
    pulseaudio \
    python3 \
    python3-evdev \
    python3-gi \
    python3-gst-1.0 \
    retroarch \
    libxtst6 \
    xvfb \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 --user-group pixelated \
    && usermod -aG pulse-access pixelated \
    && mkdir -p /app /cores /roms /run/pixelated \
    && chown -R 10001:10001 /roms /run/pixelated /home/pixelated \
    && chmod 0700 /run/pixelated

COPY --from=app-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=app-builder /app/dist /app/dist
COPY --from=app-builder /app/node_modules /app/node_modules
COPY --from=mesen-builder /out/mesen_libretro.so /cores/mesen_libretro.so
COPY --from=mgba-builder /out/mgba_libretro.so /cores/mgba_libretro.so
COPY --from=bsnes-builder /out/bsnes_libretro.so /cores/bsnes_libretro.so
COPY --from=picodrive-builder /out/picodrive_libretro.so /cores/picodrive_libretro.so
COPY --from=python-builder /out /usr/local/lib/python3.10/dist-packages
COPY camera.py camera_config.py camera_protocol.py camera_state.py input_gamepad.py input_keyboard.py /app/

WORKDIR /app
ENV HOME=/home/pixelated
USER 10001:10001

CMD ["node", "dist/server.js"]

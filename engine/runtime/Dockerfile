ARG UBUNTU_IMAGE=ubuntu:22.04@sha256:4f838adc7181d9039ac795a7d0aba05a9bd9ecd480d294483169c5def983b64d
ARG NODE_IMAGE=node:20.20.2-bullseye-slim@sha256:65ef49f7d24aefd012a7fc6f9a2b734bcc19e424976a81f60c86b47266ef5b28

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

ARG MGBA_REF=0.10.5
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

FROM ${UBUNTU_IMAGE} AS python-builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip \
    && pip3 install --no-cache-dir --target /out "python-socketio[client]" \
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

RUN apt-get update && apt-get install -y --no-install-recommends \
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
    xdotool \
    xvfb \
    && rm -rf /var/lib/apt/lists/* \
    && usermod -aG pulse-access root \
    && mkdir -p /app /cores /roms

COPY --from=app-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=app-builder /app/dist /app/dist
COPY --from=app-builder /app/node_modules /app/node_modules
COPY --from=mesen-builder /out/mesen_libretro.so /cores/mesen_libretro.so
COPY --from=mgba-builder /out/mgba_libretro.so /cores/mgba_libretro.so
COPY --from=bsnes-builder /out/bsnes_libretro.so /cores/bsnes_libretro.so
COPY --from=python-builder /out /usr/local/lib/python3.10/dist-packages
COPY camera.py input_gamepad.py /app/

WORKDIR /app

CMD ["node", "dist/server.js"]

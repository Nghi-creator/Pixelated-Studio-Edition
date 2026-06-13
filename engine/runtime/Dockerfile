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
COPY --from=python-builder /out /usr/local/lib/python3.10/dist-packages
COPY camera.py input_gamepad.py /app/

WORKDIR /app

CMD ["node", "dist/server.js"]

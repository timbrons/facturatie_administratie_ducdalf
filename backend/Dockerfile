# PocketBase voor Duc'dalf. De versie staat hier vast; de checksums komen uit
# https://github.com/pocketbase/pocketbase/releases/download/v<versie>/checksums.txt
FROM alpine:3.22

ARG PB_VERSION=0.40.4
ARG PB_SHA256_AMD64=9042ec818570e79c3628dadcd0a756c1496d9e1173918ec409d133c02f82e5fa
ARG PB_SHA256_ARM64=86095bf8ed9345954f0d2bf0a5fb9b57584ae60b77ebf3b6cd23a8003a3fd418
ARG TARGETARCH

# wget en unzip zitten al in Alpine (BusyBox); er is verder niets nodig.
RUN ARCH="${TARGETARCH:-amd64}" \
 && case "$ARCH" in amd64) SUM="$PB_SHA256_AMD64";; arm64) SUM="$PB_SHA256_ARM64";; *) echo "Niet-ondersteunde architectuur: $ARCH" && exit 1;; esac \
 && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${ARCH}.zip" \
 && echo "$SUM  /tmp/pb.zip" | sha256sum -c - \
 && unzip /tmp/pb.zip pocketbase -d /pb \
 && rm /tmp/pb.zip

WORKDIR /pb
EXPOSE 8090

# Migraties, hooks en de (optionele) frontend worden als map gekoppeld, zodat
# een update van de app alleen het vervangen van die mappen is.
CMD ["sh", "-c", "exec /pb/pocketbase serve --http=0.0.0.0:8090 --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks --publicDir=/pb/pb_public --origins=\"${PB_ORIGINS:-https://timbrons.github.io}\""]

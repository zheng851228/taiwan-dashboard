# Runtime image: official Valhalla + prebuilt Taiwan tiles (tar extract).
# Build context = the "out/" dir produced by .github/workflows/valhalla-image.yml
# containing: valhalla.json, tiles.tar, admins.sqlite, timezones.sqlite
ARG VALHALLA_TAG=3.6.0
FROM ghcr.io/valhalla/valhalla:${VALHALLA_TAG}

USER root
# Empty tile_dir so the config path exists; real tiles are read from tiles.tar (mmap).
RUN mkdir -p /data/tiles
COPY valhalla.json tiles.tar admins.sqlite timezones.sqlite /data/
RUN chmod -R a+rX /data

# Numeric non-root user (works even if the base image has no named user).
USER 59999:59999
EXPOSE 8080
# Override any entrypoint of the base image; Cloud Run sends traffic to :8080
# (listen address is set in valhalla.json via httpd.service.listen).
ENTRYPOINT []
CMD ["valhalla_service", "/data/valhalla.json", "1"]

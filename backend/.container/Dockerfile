FROM archlinux:base

# ----------------------------------
# System dependencies (without rustup!)
# ----------------------------------
RUN pacman -Syu --noconfirm
RUN pacman -S --noconfirm git base-devel sudo

# RUN pacman -S --noconfirm docker docker-compose fc-cache

# Install yay (AUR helper)
# Create a non-root user for building AUR packages
RUN useradd -m -G wheel -s /bin/bash builder && \
    echo '%wheel ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers

# Clone and build yay as the builder user
RUN cd /home/builder && \
    sudo -u builder git clone https://aur.archlinux.org/yay.git && \
    cd yay && \
    sudo -u builder makepkg -si --noconfirm && \
    cd .. && \
    rm -rf yay


RUN git clone https://github.com/mikeyjay39/dotfiles.git 

RUN cat dotfiles/install/install-base-packages.sh

RUN source dotfiles/install/install-base-packages.sh

RUN pacman -Scc --noconfirm

# Initialize rustup properly
# RUN rustup toolchain install stable
# RUN rustup default stable
#
# RUN rustup component add rust-analyzer
#
# RUN cargo install cargo-nextest --locked

# ----------------------------------
# Cargo/Rust environment
# ----------------------------------
# ENV CARGO_HOME=/root/.cargo
# ENV RUSTUP_HOME=/root/.rustup
# ENV PATH="/root/.cargo/bin:${PATH}:/usr/lib/rustup:/usr/lib/rustup/bin"

# auto-load rustup env
# RUN echo 'source $HOME/.cargo/env' >> /root/.bashrc

# RUN mkdir -p ${CARGO_HOME} ${RUSTUP_HOME}

# ----------------------------------
# Set working directory
# ----------------------------------
# WORKDIR /workspace

# ----------------------------------
# Default command
# ----------------------------------
CMD ["nvim"]

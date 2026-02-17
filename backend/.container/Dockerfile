FROM archlinux:base

# ----------------------------------
# System dependencies (without rustup!)
# ----------------------------------
RUN pacman -Syu --noconfirm
RUN pacman -S --noconfirm git base-devel sudo rustup

# ----------------------------------
# Create user matching host user
# ----------------------------------
ARG USER_ID=1000
ARG GROUP_ID=1000
ARG USERNAME=devuser

RUN groupadd -g ${GROUP_ID} ${USERNAME} && \
    useradd -m -u ${USER_ID} -g ${GROUP_ID} -G wheel -s /bin/bash ${USERNAME} && \
    echo '%wheel ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers

# Set password safely
RUN echo "$USERNAME:changeme" | chpasswd

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


RUN cd /home/${USERNAME} && git clone https://github.com/mikeyjay39/dotfiles.git 

RUN source /home/${USERNAME}/dotfiles/install/install-base-packages.sh

RUN chown -R ${USERNAME}:${USERNAME} /home/${USERNAME}

RUN su -c 'source /home/${USERNAME}/dotfiles/install/setup-symlinks.sh' ${USERNAME}

RUN mv /home/${USERNAME}/scripts /home/${USERNAME}/.scripts

RUN su -c 'source /usr/share/nvm/init-nvm.sh && nvm install 22 && nvm use 22' ${USERNAME}

# RUN source /home/${USERNAME}/dotfiles/install/install-rust-dependencies.sh

RUN pacman -Scc --noconfirm

RUN cd /home/${USERNAME} && git clone https://github.com/mikeyjay39/life-manager

# Initialize rustup properly
RUN cd /home/${USERNAME}/life-manager && \
    rustup toolchain install stable && \
    rustup default stable &&  \
    rustup component add rust-analyzer && \
    cargo install cargo-nextest --locked

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


RUN chown -R ${USERNAME}:${USERNAME} /home/${USERNAME}

USER ${USERNAME}
WORKDIR /home/${USERNAME}
CMD ["nvim"]

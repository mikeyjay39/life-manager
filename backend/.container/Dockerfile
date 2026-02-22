FROM archlinux:base

# ----------------------------------
# System dependencies (without rustup!)
# ----------------------------------
RUN pacman -Syu --noconfirm
RUN pacman -S --noconfirm git base-devel sudo rustup postgresql-libs 

# ----------------------------------
# Create user matching host user
# ----------------------------------
ARG USER_ID=1000
ARG GROUP_ID=1000
ARG DOCKER_GID=965
ARG USERNAME=devuser

# Create docker group with host's docker GID
RUN groupadd -g ${DOCKER_GID} docker || true

# Create user with proper groups
RUN groupadd -g ${GROUP_ID} ${USERNAME} && \
    useradd -m -u ${USER_ID} -g ${GROUP_ID} -G wheel,docker -s /bin/bash ${USERNAME} && \
    echo '%wheel ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers

# Set password safely
RUN echo "$USERNAME:changeme" | chpasswd

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

RUN pacman -Scc --noconfirm

RUN cd /home/${USERNAME} && git clone https://github.com/mikeyjay39/life-manager

# Create directories for mounted volumes with proper ownership
RUN mkdir -p /home/${USERNAME}/.local/share/nvim \
             /home/${USERNAME}/.local/share/zoxide \
             /home/${USERNAME}/.local/state/nvim \
             /home/${USERNAME}/.cache/nvim \
             /home/${USERNAME}/.cargo \
             /home/${USERNAME}/.rustup \
             /home/${USERNAME}/.cache/starship && \
             chown -R ${USERNAME}:${USERNAME} /home/${USERNAME}

# ----------------------------------
# Cargo/Rust environment
# ----------------------------------

ENV CARGO_HOME=/home/${USERNAME}/.cargo
ENV RUSTUP_HOME=/home/${USERNAME}/.rustup

RUN su -c 'cd /home/${USERNAME}/life-manager && \
    rustup toolchain install stable && \
    rustup default stable &&  \
    rustup component add rust-analyzer && \
    cargo install cargo-nextest --locked' ${USERNAME}

ENV PATH="/home/${USERNAME}/.cargo/bin:${PATH}:/usr/lib/rustup:/usr/lib/rustup/bin:/home/${USERNAME}/.rustup"

# Manually compile and install Rust treesitter parser
# nvim-treesitter's TSInstall has issues finding the compiler, so we compile manually
RUN cd /tmp && \
    git clone --depth 1 https://github.com/tree-sitter/tree-sitter-rust.git && \
    cd tree-sitter-rust && \
    gcc -o rust.so -shared src/parser.c src/scanner.c -I./src -Os -fPIC && \
    mkdir -p /home/${USERNAME}/.local/share/nvim/lazy/nvim-treesitter/parser && \
    cp rust.so /home/${USERNAME}/.local/share/nvim/lazy/nvim-treesitter/parser/ && \
    cd / && rm -rf /tmp/tree-sitter-rust

RUN chown -R ${USERNAME}:${USERNAME} /home/${USERNAME}


USER ${USERNAME}
WORKDIR /home/${USERNAME}
CMD ["nvim"]

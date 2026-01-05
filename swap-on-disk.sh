# 1. Create a 4GB file to use as swap
sudo fallocate -l 10G /swapfile

# 2. Secure the file (only root should read/write it)
sudo chmod 600 /swapfile

# 3. Format it as swap space
sudo mkswap /swapfile

# 4. Enable the swap
sudo swapon /swapfile

# 5. Make it permanent (optional, so it stays after reboot)
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

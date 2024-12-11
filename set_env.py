import os
import subprocess

def set_heroku_env_vars(env_file, heroku_app_name):
    if not os.path.exists(env_file):
        print(f"Error: The file '{env_file}' does not exist.")
        return

    with open(env_file, "r") as file:
        for line in file:
            line = line.strip()

            # Skip empty lines and comments
            if not line or line.startswith("#"):
                continue

            # Split the key and value
            if "=" in line:
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip()

                # Skip if value is empty or commented out
                if not value or value.startswith("#"):
                    continue

                # Use Heroku CLI to set the environment variable
                try:
                    subprocess.run(
                        ["heroku", "config:set", f"{key}={value}", "-a", heroku_app_name],
                        check=True,
                        text=True
                    )
                    print(f"Set {key} on Heroku app '{heroku_app_name}'.")
                except subprocess.CalledProcessError as e:
                    print(f"Error setting {key}: {e}")
    print("Environment variables update complete.")

if __name__ == "__main__":
    # Specify the path to your .env file and Heroku app name
    env_file = ".env"
    heroku_app_name = "ames-crystalchat"

    set_heroku_env_vars(env_file, heroku_app_name)

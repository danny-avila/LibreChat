#!/bin/bash

# Define colors
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Initialize variables
update=false
terminal="konsole"

# Parse arguments
while (( "$#" )); do
  case "$1" in
    update)
      update=true
      shift
      ;;
    gnome|konsole)
      terminal="$1"
      shift
      ;;
    *)
      echo -e "${RED}Error: Invalid argument${NC}"
      echo -e "${CYAN}Usage: $0 [update] [gnome|konsole]${NC}"
      echo -e "${CYAN}update: Optional. If provided, the script will update the repository and clean the npm cache before running.${NC}"
      echo -e "${CYAN}gnome|konsole: Optional. Specifies the terminal to use. If not provided, the script will default to Konsole.${NC}"
      exit 1
      ;;
  esac
done


# if [ "$1" == "-h" ]; then
#     echo -e "${CYAN}Usage: $0 [update] [gnome|konsole]${NC}"
#     echo -e "${CYAN}update: Optional. If provided, the script will update the repository and clean the npm cache before running.${NC}"
#     echo -e "${CYAN}gnome|konsole: Optional. Specifies the terminal to use. If not provided, the script will default to Konsole.${NC}"
#     exit 0
# fi

# Check the terminal argument
if [ ${terminal} == "gnome" ]; then
    terminal="gnome-terminal"
elif [ ${terminal} == "konsole" ]; then
    terminal="konsole"
# else
#     # Default to Konsole if no valid terminal argument is provided
#     terminal="konsole"
fi

# Check if the chosen terminal is installed
if command -v $terminal &> /dev/null
then
    echo -e "${GREEN}$terminal is installed, using $terminal.${NC}"
else
    echo -e "${RED}$terminal is not installed.${NC}"
    echo -e "${CYAN}Would you like to install it? (y/n)${NC}"
    read answer
    if [ "$answer" != "${answer#[Yy]}" ] ;then
        if [ "$terminal" == "konsole" ]; then
            echo -e "${CYAN}Installing Konsole...${NC}"
            if [ "$(lsb_release -si)" == "Arch" ]; then
                sudo pacman -S konsole
            elif [ "$(lsb_release -si)" == "Ubuntu" ]; then
                sudo apt-get install konsole
            fi
        else
            echo -e "${CYAN}Installing Gnome Terminal...${NC}"
            if [ "$(lsb_release -si)" == "Arch" ]; then
                sudo pacman -S gnome-terminal
            elif [ "$(lsb_release -si)" == "Ubuntu" ]; then
                sudo apt-get install gnome-terminal
            fi
        fi
    else
        echo -e "${RED}Exiting as $terminal is not installed.${NC}"
        exit 1
    fi
fi

# Kill all existing terminal processes
killall $terminal

# Store the current working directory
working_dir=$(pwd)
echo -e "${CYAN}Current working directory: $working_dir${NC}"

init_script="${working_dir}/.initialize_librechat"

if [ -f "$init_script" ]; then
    # Start a new terminal process
    $terminal &
    # Sleep for a bit to ensure the new terminal process has started
    sleep 2

    # Get the session id of the new terminal process
    if [ "$terminal" == "konsole" ]; then
        session=$(qdbus | grep konsole | cut -d'-' -f2)
    else
        session=$(pgrep gnome-terminal)
    fi

    # Run the commands in new tabs
    if [ "$1" == "update" ]; then
        if [ "$terminal" == "konsole" ]; then
            qdbus org.kde.konsole-$session /Sessions/1 setTitle 1 "Run librechat"
            qdbus org.kde.konsole-$session /Sessions/1 runCommand "cd $working_dir && chmod +x ${init_script} && ${init_script} update"
        else
            # gnome-terminal -- bash -c "cd $working_dir && chmod +x ${init_script} && ${init_script} update; exec bash"
            gnome-terminal --tab --title="Init LibreChat with update" --working-directory=$working_dir -- bash -c "chmod +x ${init_script} && ${init_script} update ; exec bash"
        fi
    else
        if [ "$terminal" == "konsole" ]; then
            qdbus org.kde.konsole-$session /Sessions/1 setTitle 1 "Run librechat"
            qdbus org.kde.konsole-$session /Sessions/1 runCommand "cd $working_dir && chmod +x ${init_script} && ${init_script} "
        else
            # gnome-terminal -- bash -c "cd $working_dir && chmod +x ${init_script} && ${init_script} ; exec bash"
            gnome-terminal --tab --title="Init LibreChat" --working-directory=$working_dir -- bash -c "chmod +x ${init_script} && ${init_script} ; exec bash"
        fi
    fi

    # run Docker logs for debugging
    if [ "$terminal" == "konsole" ]; then
        qdbus org.kde.konsole-$session /Windows/1 newSession
        qdbus org.kde.konsole-$session /Sessions/2 setTitle 2 "Mongodb Logs"
        qdbus org.kde.konsole-$session /Sessions/2 runCommand "docker logs -ft chat-mongodb"
        qdbus org.kde.konsole-$session /Windows/1 newSession
        qdbus org.kde.konsole-$session /Sessions/3 setTitle 3 "Meilisearch Logs"
        qdbus org.kde.konsole-$session /Sessions/3 runCommand "docker logs -ft chat-meilisearch"
    else
        gnome-terminal --tab --title="Mongodb Log" -- bash -c "docker logs -ft chat-mongodb; exec bash"
        gnome-terminal --tab --title="Meilisearch Log" -- bash -c "docker logs -ft chat-meilisearch; exec bash"
    fi
else
    echo -e "${RED}The ${init_script} file was not found in the current directory.${NC}"
    exit 1
fi

#define _CRT_SECURE_NO_WARNINGS

#include <algorithm>
#include <array>
#include <csignal>
#include <cstdlib>
#include <exception>
#include <filesystem>
#include <future>
#include <iostream>
#include <map>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <direct.h>
#include <windows.h>
#define CHDIR _chdir
#define POPEN _popen
#define PCLOSE _pclose
#else
#include <unistd.h>
#define CHDIR chdir
#define POPEN popen
#define PCLOSE pclose
#endif


void runRAGAPI();
void runFrontend(const std::string& mode, const std::string& npmPath,
                 const std::filesystem::path& projectPath);
void runBackend(const std::string& mode, const std::string& npmPath,
                const std::filesystem::path& projectPath);
void runMeilisearch(const std::string& masterKey,
                    const std::filesystem::path& projectPath);

void signalHandler(int signum) {
  std::cout << "Interrupt signal (" << signum << ") received.\n";
  std::exit(0);
}

namespace platform {
std::string getOS() {
#ifdef _WIN32
  return "Windows";
#elif __APPLE__
  return "macOS";
#elif __linux__
  return "Linux";
#else
  return "Unknown";
#endif
}

bool changeDirectory(const std::string& cwd) { return CHDIR(cwd.c_str()) == 0; }

FILE* openPipe(const std::string& command, const std::string& mode) {
  return POPEN(command.c_str(), mode.c_str());
}

int closePipe(FILE* pipe) { return PCLOSE(pipe); }

std::string getEnvVar(const std::string& key) {
  char* val = getenv(key.c_str());
  return val ? std::string(val) : std::string();
}
}  // namespace platform

namespace utils {
void runCommand(const std::string& cmd, const std::string& cwd = "") {
  std::array<char, 128> buffer;

  std::cout << "Executing command: " << cmd << std::endl;
  if (!cwd.empty() && !platform::changeDirectory(cwd)) {
    throw std::runtime_error("chdir() failed!");
  }

  FILE* pipe = platform::openPipe(cmd, "r");
  if (!pipe) {
    throw std::runtime_error("popen() failed!");
  }

  while (fgets(buffer.data(), buffer.size(), pipe) != nullptr) {
    std::cout << buffer.data();
  }

  platform::closePipe(pipe);
}

bool commandExists(const std::string& cmd) {
  std::string whichCmd = platform::getOS() == "Windows" ? "where" : "which";
  return system((whichCmd + " " + cmd + " > nul 2>&1").c_str()) == 0;
}

std::string findCommand(const std::string& command) {
  std::string pathEnv = platform::getEnvVar("PATH");
  std::string delimiter = platform::getOS() == "Windows" ? ";" : ":";
  std::string token;
  std::string path;

  int pos = 0;
  while ((pos = pathEnv.find(delimiter)) != std::string::npos) {
    token = pathEnv.substr(0, pos);
    std::filesystem::path cmdPath = std::filesystem::path(token) / command;
    if (std::filesystem::exists(cmdPath)) {
      std::filesystem::path adjusted_cmd = cmdPath;
      if (cmdPath.string().find(' ') != std::string::npos) {
        adjusted_cmd = "\"" + cmdPath.string() + "\"";
      }
      return adjusted_cmd.string();
    }
    pathEnv.erase(0, pos + delimiter.length());
  }
  return "";
}

void activateVirtualEnv(const std::filesystem::path& venvPath) {
  std::cout << "Activating virtual environment..." << std::endl;

  try {
    std::string pathEnv = std::getenv("PATH");
    std::string venvBinPath =
        (venvPath / (platform::getOS() == "Windows" ? "Scripts" : "bin"))
            .string();
    std::string newPathEnv =
        venvBinPath + (platform::getOS() == "Windows" ? ";" : ":") + pathEnv;

#ifdef _WIN32
    if (_putenv_s("PATH", newPathEnv.c_str()) != 0) {
      throw std::runtime_error("Failed to update PATH environment variable");
    }
#else
    if (setenv("PATH", newPathEnv.c_str(), 1) != 0) {
      throw std::runtime_error("Failed to update PATH environment variable");
    }
#endif

    std::cout << "Virtual environment activated successfully." << std::endl;
  } catch (const std::exception& e) {
    std::cerr << "Error: " << e.what() << std::endl;
  } catch (...) {
    std::cerr << "An unknown error occurred." << std::endl;
  }
}
}  // namespace utils

namespace project {
void updateProject() {
  std::cout << "Checking for project updates from GitHub..." << std::endl;

  utils::runCommand("git fetch");

  FILE* statusPipe = platform::openPipe("git status -uno", "r");
  if (!statusPipe) {
    throw std::runtime_error("popen() failed!");
  }

  bool updatesAvailable = false;
  std::array<char, 128> buffer;
  while (fgets(buffer.data(), buffer.size(), statusPipe) != nullptr) {
    std::string statusOutput(buffer.data());
    if (statusOutput.find("Your branch is behind") != std::string::npos) {
      updatesAvailable = true;
      break;
    }
  }
  platform::closePipe(statusPipe);

  if (updatesAvailable) {
    std::cout << "Updates found. Pulling changes..." << std::endl;
    utils::runCommand("git pull --rebase");
  } else {
    std::cout << "No updates available." << std::endl;
  }
}

void setupRAGAPI(const std::filesystem::path& ragAPIPath,
                 const std::filesystem::path& venvPath) {
  if (!std::filesystem::exists(ragAPIPath)) {
    std::cout << "Cloning rag_api repository..." << std::endl;
    utils::runCommand("git clone https://github.com/danny-avila/rag_api");
  } else {
    std::cout << "rag_api repository already exists at " << ragAPIPath
              << std::endl;
  }

  if (utils::commandExists("poetry") &&
      std::filesystem::exists(ragAPIPath / "pyproject.toml")) {
    if (!std::filesystem::exists(venvPath)) {
      std::cout << "Setting up virtual environment and installing dependencies "
                   "using (poetry)..."
                << std::endl;
      utils::runCommand("poetry install", ragAPIPath.string());
    } else {
      utils::activateVirtualEnv(venvPath);
      std::cout << "Virtual environment already exists." << std::endl;
    }
  } else {
    std::cout << "Setting up virtual environment and installing dependencies "
                 "using (pip)..."
              << std::endl;
    if (!std::filesystem::exists(venvPath)) {
      std::cout << "Create virtual environment..." << std::endl;
      utils::runCommand("python -m venv .venv", ragAPIPath.string());
      utils::activateVirtualEnv(venvPath);
      std::cout << "Install dependencies..." << std::endl;
      utils::runCommand("pip install -r requirements.lite.txt",
                        ragAPIPath.string());
      std::cerr << "Poetry is not installed. Unable to set up rag_api."
                << std::endl;
    } else {
      utils::activateVirtualEnv(venvPath);
      std::cout << "Virtual environment already exists." << std::endl;
    }
  }
}

void runRAGAPI(const std::string& mode, const std::filesystem::path& ragAPIPath,
               const std::filesystem::path& venvPath) {
  utils::activateVirtualEnv(venvPath);
  std::cout << "Running the RAG API using FastAPI...\n";
  std::string cmd = "uvicorn main:app --host 0.0.0.0 --port 8000";
  if (mode != "prod") {
    cmd += " --reload";
  }
  utils::runCommand(cmd, ragAPIPath.string());
}

void setupNPM(const std::filesystem::path& projectPath) {
  std::string npmPath = utils::findCommand("npm");
  std::filesystem::path modulesPath = projectPath / "node_modules";

  if (!std::filesystem::exists(modulesPath)) {
    std::cout << "Installing npm dependencies..." << std::endl;
    utils::runCommand(npmPath + " ci", projectPath.string());
  } else {
    std::cout << "npm dependencies already installed." << std::endl;
  }
}

void runFrontend(const std::string& mode, const std::string& npmPath,
                 const std::filesystem::path& projectPath) {
  using namespace std::filesystem;

  std::map<std::string, std::string> modeMapping = {{"prod", "production"},
                                                    {"dev", "development"}};
  std::cout << "Running frontend in " << modeMapping[mode] << " mode..."
            << std::endl;
  std::string modeCmd = mode == "prod" ? "frontend" : "frontend:dev";
  std::string npmRunFrontendCmd = npmPath + " run " + modeCmd;
  utils::runCommand(npmRunFrontendCmd, projectPath.string());
}

void runBackend(const std::string& mode, const std::string& npmPath,
                const std::filesystem::path& projectPath) {
  using namespace std::filesystem;

  std::map<std::string, std::string> modeMapping = {{"prod", "production"},
                                                    {"dev", "development"}};
  std::cout << "Running backend in " << modeMapping[mode] << " mode..."
            << std::endl;
  std::string modeCmd = mode == "prod" ? "backend" : "backend:dev";
  std::string npmRunBackendCmd = npmPath + " run " + modeCmd;
  utils::runCommand(npmRunBackendCmd, projectPath.string());
}

void runMeilisearch(const std::string& masterKey,
                    const std::filesystem::path& projectPath) {
  using namespace std::filesystem;

  std::string meilisearchBinaryName =
      platform::getOS() == "Windows" ? "meilisearch.exe" : "meilisearch";
  std::filesystem::path meilisearchBinary = projectPath / meilisearchBinaryName;

  if (!exists(meilisearchBinary)) {
    std::cerr << "Meilisearch binary not found in the project folder."
              << std::endl;
    std::cerr
        << "Download the appropriate binary and place it in the project folder."
        << std::endl;
    std::exit(1);
  }

  std::cout << "Running Meilisearch..." << std::endl;
  std::string meilisearchCmd =
      meilisearchBinary.string() + " --master-key " + masterKey;
  utils::runCommand(meilisearchCmd, projectPath.string());
}
}  // namespace project

int main(int argc, char* argv[]) {
  signal(SIGINT, [](int signum) {
    std::cout << "Interrupt signal (" << signum << ") received.\n";
    exit(0);
  });

  std::string mode = "prod",
              masterKey = "3UxjMPmPntbRlarzHXON3cnOcTlAVrh4MeDxyZflraY";
  bool update = false;

  for (int i = 1; i < argc; ++i) {
    std::string arg = argv[i];
    if (arg == "--mode") {
      mode = argv[++i];
    } else if (arg == "--master-key") {
      masterKey = argv[++i];
    } else if (arg == "--update") {
      update = true;
    }
  }

  std::vector<std::string> validModes = {"prod", "dev"};
  if (std::find(validModes.begin(), validModes.end(), mode) ==
      validModes.end()) {
    std::cerr << "Invalid mode. Use 'prod' or 'dev'." << std::endl;
    return 1;
  }

  if (update) project::updateProject();

  auto projectPath = std::filesystem::current_path(),
       ragAPIPath = projectPath / "rag_api", venvPath = ragAPIPath / ".venv";

  project::setupRAGAPI(ragAPIPath, venvPath);
  project::setupNPM(projectPath);

  std::string npmPath = utils::findCommand("npm");
  if (npmPath.empty() || !utils::commandExists("python")) {
    std::cerr << (npmPath.empty() ? "npm" : "Python") << " is not installed.\n";
    return 1;
  }

  if (!std::filesystem::exists(projectPath / ".env")) {
    std::cerr << "The .env file is missing. Please configure .env file before "
                 "proceeds."
              << std::endl;
    return 1;
  }

  std::vector<std::future<void>> futures;
  try {
    futures.push_back(std::async(std::launch::async, project::runRAGAPI, mode,
                                 ragAPIPath, venvPath));
    futures.push_back(std::async(std::launch::async, project::runMeilisearch,
                                 masterKey, projectPath));

    if (mode == "prod") {
      project::runFrontend(mode, npmPath, projectPath);
      project::runBackend(mode, npmPath, projectPath);
    } else {
      futures.push_back(std::async(std::launch::async, project::runFrontend,
                                   mode, npmPath, projectPath));
      futures.push_back(std::async(std::launch::async, project::runBackend,
                                   mode, npmPath, projectPath));
    }
  } catch (const std::exception& e) {
    std::cerr << "Error: " << e.what() << std::endl;
  }

  return 0;
}

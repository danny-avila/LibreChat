{
  description = "LibreChat development and database compatibility tooling";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs_20
              jq
              skopeo
              shellcheck
              rclone
              curl
              git
              ripgrep
            ];

            shellHook = ''
              export COREPACK_ENABLE_PROJECT_SPEC=0
              echo "LibreChat dev shell: Node $(node --version), npm $(npm --version)"
            '';
          };
        }
      );
    };
}

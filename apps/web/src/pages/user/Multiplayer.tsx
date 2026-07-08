import { Link } from "react-router-dom";
import {
  ArrowLeft,
  LogIn,
} from "lucide-react";
import { PixelIcon } from "../../components/ui/PixelIcon";
import {
  HostCatalogPanel,
  JoinLobbyPanel,
  ModeButton,
  StatusPill,
} from "../../features/multiplayer/MultiplayerPagePanels";
import { useMultiplayerCatalog } from "../../features/multiplayer/useMultiplayerCatalog";

export default function Multiplayer() {
  const catalog = useMultiplayerCatalog();

  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          to="/home"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-synth-primary transition-colors font-medium group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          Back to Library
        </Link>
      </div>

      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-white">Multiplayer</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-400">
            Set up a LAN lobby. Hosts choose a game; guests join from an invite
            and request a slot after connecting.
          </p>
        </div>
        <StatusPill paired={catalog.isEnginePaired} />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <ModeButton
          active={catalog.mode === "host"}
          icon={<PixelIcon className="h-4 w-4" name="multiplayer" />}
          label="Host Game"
          onClick={() => catalog.setMode("host")}
        />
        <ModeButton
          active={catalog.mode === "join"}
          icon={<LogIn className="h-4 w-4" />}
          label="Join Game"
          onClick={() => catalog.setMode("join")}
        />
      </div>

      {catalog.mode === "join" ? (
        <JoinLobbyPanel
          inviteSessionId={catalog.inviteSessionId}
          inviteUrl={catalog.inviteUrl}
          joinInvite={catalog.joinInvite}
          setInviteUrl={catalog.setInviteUrl}
        />
      ) : (
        <HostCatalogPanel catalog={catalog} />
      )}
    </div>
  );
}

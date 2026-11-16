import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Welcome } from "./workspace-welcome";
import { mountActivity, mountContext, mountComposer, mountDiffs, mountSources } from "./layro-bridge";
import { StudioDialog } from "./studio";
import { startNexus, type StudioPage } from "./nexus-engine.js";

const overlay = createRoot(document.getElementById("studio-ui")!);
function show(page: StudioPage | null) {
  overlay.render(<StudioDialog page={page} navigate={show} dismiss={() => show(null)} />);
}
show(null);

startNexus({
  mountWelcome(target, suggestions) {
    const root = createRoot(target);
    root.render(<Welcome suggestions={suggestions} />);
    return () => flushSync(() => root.unmount());
  },
  mountActivity,
  mountContext,
  mountComposer,
  mountDiffs,
  mountSources,
  open: show,
});

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components/shell.css";
import "./styles/components/composer.css";
import "./styles/components/messages.css";
import "./styles/components/models.css";
import "./styles/components/dialogs.css";
import "./styles/components/explorer.css";

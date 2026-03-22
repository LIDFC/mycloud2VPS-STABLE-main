import { useState } from "react";
import MiniPlayer from "./MiniPlayer";
import FullPlayer from "./FullPlayer";

/**
 * Player — orchestrates MiniPlayer (bottom strip) and FullPlayer (modal).
 * Click cover or title in MiniPlayer → opens FullPlayer.
 * Close button / Escape / click outside → back to MiniPlayer.
 */
export default function Player() {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <MiniPlayer onExpand={() => setExpanded(true)} />
      <FullPlayer open={expanded} onClose={() => setExpanded(false)} />
    </>
  );
}

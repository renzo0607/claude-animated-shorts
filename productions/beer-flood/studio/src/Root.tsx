import React from "react";
import { Composition } from "remotion";
import { BridgeShort, BRIDGE_FRAMES } from "./videos/bridge/Bridge";
import { BeerFlood, BEER_FRAMES } from "./videos/beer/Beer";
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="BeerFlood" component={BeerFlood} durationInFrames={BEER_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="BridgeShort" component={BridgeShort} durationInFrames={BRIDGE_FRAMES} fps={30} width={1080} height={1920} />
  </>
);

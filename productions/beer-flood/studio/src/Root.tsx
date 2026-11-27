import React from "react";
import { Composition } from "remotion";

import { BeerFlood, BEER_FRAMES } from "./videos/beer/Beer";
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="BeerFlood" component={BeerFlood} durationInFrames={BEER_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="BeerFloodPreview" component={BeerFlood} durationInFrames={Math.ceil(BEER_FRAMES / 2)} fps={15} width={540} height={960} defaultProps={{}} />

  </>
);

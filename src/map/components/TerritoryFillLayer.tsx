import type { GeneratedMapData, TerritoryState } from "../mapTypes";

const SELECTED_WHITE_MIX = 0.35;

export function TerritoryFillLayer({
  mapData,
  territoryStates,
}: {
  mapData: GeneratedMapData;
  territoryStates: Record<string, TerritoryState>;
}) {
  return (
    <g className="territory-fill-layer">
      {mapData.territories.map((territory) => {
        const state = territoryStates[territory.id];
        const baseColor = territory.skins[state.skin];
        const color = state.status === "selected" ? mixWithWhite(baseColor, SELECTED_WHITE_MIX) : baseColor;

        return (
          <g
            data-territory-fill={territory.id}
            data-territory-fill-state={state.status}
            data-territory-id={territory.id}
            data-territory-skin={state.skin}
            key={territory.id}
          >
            {territory.fillPaths.map((path, index) => (
              <path
                className={`territory-fill ${state.status}`}
                d={path}
                data-territory-fill-piece={territory.id}
                fill={color}
                key={index}
                stroke={color}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

function mixWithWhite(color: string, amount: number) {
  const rgb = parseHexColor(color);

  if (!rgb) {
    return color;
  }

  return rgbToHex(
    Math.round(rgb.r + (255 - rgb.r) * amount),
    Math.round(rgb.g + (255 - rgb.g) * amount),
    Math.round(rgb.b + (255 - rgb.b) * amount),
  );
}

function parseHexColor(color: string) {
  const match = color.match(/^#([0-9a-f]{6})$/i);

  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1], 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

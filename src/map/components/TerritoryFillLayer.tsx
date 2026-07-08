import type { GeneratedMapData, TerritoryState } from "../mapTypes";

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
        const color = territory.skins[state.skin];

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
            {state.status === "selected"
              ? territory.fillPaths.map((path, index) => (
                  <path className="territory-selected-wash" d={path} key={`wash-${index}`} />
                ))
              : null}
          </g>
        );
      })}
    </g>
  );
}

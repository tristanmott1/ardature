import type { CSSProperties } from "react";
import type { GeneratedMapData, GeneratedTerritoryData, MapSkin, TerritoryState } from "../mapTypes";

export function SkinPicker({
  mapData,
  onSelectSkin,
  selectedState,
  selectedTerritory,
}: {
  mapData: GeneratedMapData;
  onSelectSkin: (skin: MapSkin) => void;
  selectedState: TerritoryState | null;
  selectedTerritory: GeneratedTerritoryData | null;
}) {
  if (!selectedState || !selectedTerritory) {
    return null;
  }

  return (
    <div className="skin-picker" data-skin-picker="true">
      {mapData.skins.map((skin) => {
        const color = selectedTerritory.skins[skin];

        return (
          <button
            aria-label={skin}
            className={selectedState.skin === skin ? "skin-swatch selected" : "skin-swatch"}
            data-skin-option={skin}
            key={skin}
            onClick={() => onSelectSkin(skin)}
            style={{ "--skin-color": color } as CSSProperties}
            title={skin}
            type="button"
          />
        );
      })}
    </div>
  );
}

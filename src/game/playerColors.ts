import type { PlayerColor } from "./gameTypes";

export function colorCss(color: PlayerColor | null) {
  switch (color) {
    case "green":
      return "#5ca76b";
    case "blue":
      return "#5fb7c0";
    case "yellow":
      return "#d9c75f";
    case "red":
      return "#b3444a";
    case "purple":
      return "#8a5fc4";
    case "black":
      return "#3f3f3f";
    default:
      return "#efe9d9";
  }
}

export function colorLabel(color: PlayerColor) {
  switch (color) {
    case "green":
      return "Green";
    case "blue":
      return "Blue";
    case "yellow":
      return "Yellow";
    case "red":
      return "Red";
    case "purple":
      return "Purple";
    case "black":
      return "Black";
  }
}

export function isLightColor(color: PlayerColor | null) {
  return color === "green" || color === "blue" || color === "yellow";
}

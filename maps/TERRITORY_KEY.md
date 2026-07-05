# Territory Key

This file is the source of truth for the Ardature Middle-earth territory map.

The map has 6 regions and 42 territories:

- Eriador: 11 territories.
- Rhovanion: 9 territories.
- Rhun: 5 territories.
- Rohan: 6 territories.
- Mordor: 4 territories.
- Gondor: 7 territories.

All connections are undirected. If territory A lists territory B as a border, territory B also borders territory A. Only the borders listed in this file exist.

## Connection Types

- Land border: normal territory adjacency.
- Ship border: dotted sea adjacency. Ship borders count as territory connections for gameplay unless a later rule explicitly changes this.
- Impassable separator: visible geography that blocks adjacency.

Canonical ship borders:

- Forlond - Harlindon.
- Harlindon - Andrast.
- Minhiriath - Andrast.
- Enedwaith - Andrast.

Canonical impassable separators:

- Fangorn Forest is not a territory and separates Lorien from Rohan.
- The mountains of Mordor block Minas Tirith from Udun and Nurn.
- The mountains of Mordor block Dagorlad from Barad-dur and all Mordor territories except Udun.

## Region: Eriador

Eriador is the largest region. It covers almost everything west of the Misty Mountains.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Forlond | Northwestern coastal territory of Eriador, north of the Gulf of Lune. | Grey Havens | Harlindon | A dotted line should be drawn across the bay to Harlindon. |
| Harlindon | Southwestern coastal territory around the Gulf of Lune, south of Forlond. | Grey Havens | Forlond, Andrast | Ship route south to Andrast. |
| Grey Havens | Western coastal territory east of the Gulf of Lune. | Forlond, Harlindon, Shire, Angmar | None | Connects the coast to northern Eriador. |
| Shire | Western-central Eriador, south of Grey Havens. | Grey Havens, Angmar, Bree, Minhiriath | None |  |
| Angmar | Northern Eriador, east of Grey Havens and north of Shire/Bree. | Grey Havens, Shire, Bree, Rivendell | None |  |
| Bree | Central Eriador, east of Shire. | Shire, Angmar, Rivendell, Minhiriath, Swanfleet | None |  |
| Rivendell | Eastern Eriador at the western side of the Misty Mountains. | Angmar, Bree, Swanfleet, Caradhras | None | Cross-region border to Caradhras in Rhovanion. |
| Minhiriath | Southwestern Eriador, south of Shire and Bree. | Shire, Bree, Swanfleet, Enedwaith | Andrast | Ship route south to Andrast. |
| Swanfleet | Southeastern Eriador near the western gate of Moria. | Bree, Rivendell, Minhiriath, Enedwaith, Isengard, Moria | None | Cross-region border to Moria in Rhovanion. |
| Enedwaith | South-central Eriador, north of Gondor. | Minhiriath, Swanfleet, Isengard, Druwaith Iaur | Andrast | Ship route southwest to Andrast. |
| Isengard | Southern Eriador at the gap near the Misty Mountains. | Swanfleet, Enedwaith, Druwaith Iaur, Westfold | None | Cross-region border to Westfold in Rohan. |

## Region: Rhovanion

Rhovanion lies east of the Misty Mountains, north of Rohan, and west of Rhun.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Greylin | Northwestern Rhovanion, north of Caradhras and west/northwest of Mirkwood. | Caradhras, Gladden Fields, Mirkwood | None |  |
| Caradhras | Western Rhovanion on the east side of the Misty Mountains. | Greylin, Gladden Fields, Moria, Rivendell | None | Cross-region border to Rivendell in Eriador. |
| Moria | Western Rhovanion south of Caradhras. | Caradhras, Gladden Fields, Dol Guldur, Lorien, Swanfleet | None | Cross-region border to Swanfleet in Eriador. |
| Lorien | Southwestern Rhovanion forest territory south of Moria. | Moria, Dol Guldur | None | Fangorn Forest blocks any southern border into Rohan. |
| Gladden Fields | Central-northern Rhovanion between Greylin, Moria, and Mirkwood. | Greylin, Caradhras, Moria, Mirkwood, Dol Guldur | None |  |
| Dol Guldur | Central Rhovanion south of Gladden Fields and along southern Mirkwood. | Gladden Fields, Moria, Lorien, Mirkwood, Emyn Muil | None |  |
| Mirkwood | Large eastern Rhovanion forest territory. | Greylin, Gladden Fields, Dol Guldur, Emyn Muil, Dagorlad, Erebor, Dale | None | Cross-region borders to Erebor and Dale in Rhun. |
| Emyn Muil | Southeastern Rhovanion west of Dagorlad and north of Rohan. | Dol Guldur, Mirkwood, Dagorlad, East Emnet | None | Cross-region border to East Emnet in Rohan. |
| Dagorlad | Southeastern Rhovanion battle plain north of Mordor and east of Rohan. | Mirkwood, Emyn Muil, East Emnet, Anorien, Udun, Minas Tirith, Dale, Dorwinion | None | Borders Mordor only through Udun. Does not border Barad-dur. |

## Region: Rhun

Rhun lies east of Rhovanion and north of Mordor.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Erebor | Northwestern Rhun, east of northern Mirkwood. | Mirkwood, Dale, Iron Hills | None |  |
| Dale | Western Rhun south of Erebor and east of Mirkwood/Dagorlad. | Erebor, Mirkwood, Dagorlad, Dorwinion, Iron Hills, Sea of Rhun | None |  |
| Iron Hills | Northern Rhun, east of Erebor and Dale. | Erebor, Dale, Sea of Rhun | None |  |
| Sea of Rhun | Eastern Rhun around the inland sea. | Dale, Dorwinion, Iron Hills | None |  |
| Dorwinion | Southwestern Rhun, east of Dagorlad and south of Dale. | Dale, Sea of Rhun, Dagorlad | None |  |

## Region: Rohan

Rohan sits near the center of the map, south of Rhovanion and north of Gondor.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Westfold | Northwestern Rohan, east of Isengard. | Isengard, West Emnet, Edoras | None | Cross-region border to Isengard in Eriador. |
| West Emnet | Northern-central Rohan, east of Westfold. | Westfold, East Emnet, Edoras, Eastfold | None |  |
| East Emnet | Northeastern Rohan, west of Emyn Muil and Dagorlad. | West Emnet, Eastfold, Anorien, Emyn Muil, Dagorlad | None | Cross-region borders to Emyn Muil and Dagorlad in Rhovanion. |
| Edoras | Southwestern-central Rohan, south of Westfold and West Emnet. | Westfold, West Emnet, Eastfold | None |  |
| Eastfold | Southeastern-central Rohan, east of Edoras. | Edoras, West Emnet, East Emnet, Anorien | None |  |
| Anorien | Southeastern Rohan, north of Minas Tirith. | Eastfold, East Emnet, Dagorlad, Minas Tirith | None | Cross-region borders to Dagorlad in Rhovanion and Minas Tirith in Gondor. |

## Region: Mordor

Mordor is the southeastern region, enclosed by mountain barriers except for the listed passes.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Udun | Northwestern Mordor, directly south of Dagorlad. | Dagorlad, Barad-dur, Minas Morgul | None | The only Mordor border from Dagorlad. Mountains block Minas Tirith from Udun. |
| Barad-dur | Northern-central Mordor, east of Udun. | Udun, Minas Morgul, Nurn | None | Does not border Dagorlad. |
| Minas Morgul | Western Mordor pass through the mountains. | Udun, Barad-dur, Nurn, Minas Tirith | None | The narrow pass connecting Mordor to Minas Tirith. |
| Nurn | Southern Mordor. | Minas Morgul, Barad-dur | None | Mountains block Minas Tirith from Nurn. |

## Region: Gondor

Gondor is the southwestern and south-central region, west of Mordor and south of Rohan.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Druwaith Iaur | Northwestern Gondor, south of Enedwaith and Isengard. | Enedwaith, Isengard, Andrast, Anfalas | None | Cross-region borders to Enedwaith and Isengard in Eriador. |
| Andrast | Southwestern Gondor peninsula. | Druwaith Iaur, Anfalas | Harlindon, Minhiriath, Enedwaith | Receives all western dotted sea routes. |
| Anfalas | Western Gondor coast east of Andrast. | Druwaith Iaur, Andrast, Lamedon | None |  |
| Lamedon | Central Gondor east of Anfalas. | Anfalas, Belfalas | None | Does not border South Gondor. |
| Belfalas | Southeastern-central Gondor coast west of Minas Tirith. | Lamedon, Minas Tirith, South Gondor | None |  |
| South Gondor | Southern Gondor, south of Belfalas and Minas Tirith. | Belfalas, Minas Tirith | None | Borders only Belfalas and Minas Tirith. |
| Minas Tirith | Eastern Gondor, west of Minas Morgul and south of Anorien/Dagorlad. | Belfalas, South Gondor, Anorien, Dagorlad, Minas Morgul | None | Does not border Udun or Nurn. Mordor access is only through Minas Morgul. |

## Alphabetical Territory Index

| Territory | Region | Land borders | Ship borders |
| --- | --- | --- | --- |
| Andrast | Gondor | Druwaith Iaur, Anfalas | Harlindon, Minhiriath, Enedwaith |
| Anfalas | Gondor | Druwaith Iaur, Andrast, Lamedon | None |
| Angmar | Eriador | Grey Havens, Shire, Bree, Rivendell | None |
| Anorien | Rohan | Eastfold, East Emnet, Dagorlad, Minas Tirith | None |
| Barad-dur | Mordor | Udun, Minas Morgul, Nurn | None |
| Belfalas | Gondor | Lamedon, Minas Tirith, South Gondor | None |
| Bree | Eriador | Shire, Angmar, Rivendell, Minhiriath, Swanfleet | None |
| Caradhras | Rhovanion | Greylin, Gladden Fields, Moria, Rivendell | None |
| Dagorlad | Rhovanion | Mirkwood, Emyn Muil, East Emnet, Anorien, Udun, Minas Tirith, Dale, Dorwinion | None |
| Dale | Rhun | Erebor, Mirkwood, Dagorlad, Dorwinion, Iron Hills, Sea of Rhun | None |
| Dol Guldur | Rhovanion | Gladden Fields, Moria, Lorien, Mirkwood, Emyn Muil | None |
| Dorwinion | Rhun | Dale, Sea of Rhun, Dagorlad | None |
| Druwaith Iaur | Gondor | Enedwaith, Isengard, Andrast, Anfalas | None |
| East Emnet | Rohan | West Emnet, Eastfold, Anorien, Emyn Muil, Dagorlad | None |
| Eastfold | Rohan | Edoras, West Emnet, East Emnet, Anorien | None |
| Edoras | Rohan | Westfold, West Emnet, Eastfold | None |
| Emyn Muil | Rhovanion | Dol Guldur, Mirkwood, Dagorlad, East Emnet | None |
| Enedwaith | Eriador | Minhiriath, Swanfleet, Isengard, Druwaith Iaur | Andrast |
| Erebor | Rhun | Mirkwood, Dale, Iron Hills | None |
| Forlond | Eriador | Grey Havens | Harlindon |
| Gladden Fields | Rhovanion | Greylin, Caradhras, Moria, Mirkwood, Dol Guldur | None |
| Grey Havens | Eriador | Forlond, Harlindon, Shire, Angmar | None |
| Greylin | Rhovanion | Caradhras, Gladden Fields, Mirkwood | None |
| Harlindon | Eriador | Grey Havens | Forlond, Andrast |
| Iron Hills | Rhun | Erebor, Dale, Sea of Rhun | None |
| Isengard | Eriador | Swanfleet, Enedwaith, Druwaith Iaur, Westfold | None |
| Lamedon | Gondor | Anfalas, Belfalas | None |
| Lorien | Rhovanion | Moria, Dol Guldur | None |
| Minas Morgul | Mordor | Udun, Barad-dur, Nurn, Minas Tirith | None |
| Minas Tirith | Gondor | Belfalas, South Gondor, Anorien, Dagorlad, Minas Morgul | None |
| Minhiriath | Eriador | Shire, Bree, Swanfleet, Enedwaith | Andrast |
| Mirkwood | Rhovanion | Greylin, Gladden Fields, Dol Guldur, Emyn Muil, Dagorlad, Erebor, Dale | None |
| Moria | Rhovanion | Caradhras, Gladden Fields, Dol Guldur, Lorien, Swanfleet | None |
| Nurn | Mordor | Minas Morgul, Barad-dur | None |
| Rivendell | Eriador | Angmar, Bree, Swanfleet, Caradhras | None |
| Sea of Rhun | Rhun | Dale, Dorwinion, Iron Hills | None |
| Shire | Eriador | Grey Havens, Angmar, Bree, Minhiriath | None |
| South Gondor | Gondor | Belfalas, Minas Tirith | None |
| Swanfleet | Eriador | Bree, Rivendell, Minhiriath, Enedwaith, Isengard, Moria | None |
| Udun | Mordor | Dagorlad, Barad-dur, Minas Morgul | None |
| West Emnet | Rohan | Westfold, East Emnet, Edoras, Eastfold | None |
| Westfold | Rohan | Isengard, West Emnet, Edoras | None |


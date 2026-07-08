# Territory Key

This file is the source of truth for the Ardature Middle-earth territory map.

The map has 6 regions and 42 territories:

- Eriador: 12 territories.
- Rhovanion: 9 territories.
- Rhun: 6 territories.
- Rohan: 4 territories.
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
- The mountains of Mordor block Minas Tirith from Udun, Lithlad, and Nurn.
- The mountains of Mordor block Dead Marshes from Mordor territories except Udun.

## Region: Eriador

Eriador is the largest region. It covers almost everything west of the Misty Mountains.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Forlond | Northwestern coastal territory of Eriador, north of the Gulf of Lune. | Grey Havens | Harlindon | Dotted route across the bay to Harlindon. |
| Grey Havens | Western coastal territory east of the Gulf of Lune. | Forlond, Harlindon, North Downs, Shire | None |  |
| Harlindon | Southwestern coastal territory around the Gulf of Lune, south of Forlond. | Grey Havens | Forlond, Andrast | Dotted routes to Forlond and Andrast. |
| Shire | Western-central Eriador, south of Grey Havens. | Grey Havens, North Downs, Bree, Minhiriath | None |  |
| Bree | Central Eriador, east of Shire. | Shire, North Downs, Ettenmoors, Rivendell, Swanfleet, Minhiriath | None |  |
| North Downs | Northern Eriador, east of Grey Havens and west of Ettenmoors. | Grey Havens, Shire, Bree, Ettenmoors | None |  |
| Ettenmoors | Northeastern Eriador, east of North Downs and northwest of Rivendell. | North Downs, Rivendell, Bree | None |  |
| Rivendell | Eastern Eriador at the western side of the Misty Mountains. | Ettenmoors, Bree, Swanfleet, Caradhras | None | Cross-region border to Caradhras in Rhovanion. |
| Minhiriath | Southwestern Eriador, south of Shire and Bree. | Shire, Bree, Swanfleet, Enedwaith | Andrast | Dotted route south to Andrast. |
| Swanfleet | Southeastern Eriador near the western gate of Moria. | Bree, Rivendell, Moria, Isengard, Minhiriath, Enedwaith | None | Cross-region border to Moria in Rhovanion. |
| Enedwaith | South-central Eriador, north of Gondor. | Minhiriath, Swanfleet, Isengard, Druwaith Iaur | Andrast | Dotted route southwest to Andrast. |
| Isengard | Southern Eriador at the gap near the Misty Mountains. | Enedwaith, Swanfleet, Westfold, Druwaith Iaur | None | Cross-region borders to Rohan and Gondor. |

## Region: Rhovanion

Rhovanion lies east of the Misty Mountains, north of Rohan, and west of Rhun.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Greylin | Northwestern Rhovanion, north of Caradhras and northwest of Woodland Realm. | Caradhras, Woodland Realm | None |  |
| Caradhras | Western Rhovanion on the east side of the Misty Mountains. | Rivendell, Greylin, Woodland Realm, Gladden Fields, Lorien | None | Cross-region border to Rivendell in Eriador. |
| Woodland Realm | Northeastern Rhovanion forest territory. | Greylin, Caradhras, Gladden Fields, Erebor, Brown Lands | None | Cross-region borders to Erebor and Brown Lands in Rhun. |
| Gladden Fields | Central-northern Rhovanion between Caradhras, Woodland Realm, Lorien, and Dol Guldur. | Woodland Realm, Caradhras, Lorien, Dol Guldur | None |  |
| Lorien | Southwestern Rhovanion forest territory. | Caradhras, Gladden Fields, Dol Guldur, Moria, Emyn Muil | None | Fangorn Forest blocks any southern border into Rohan. |
| Dol Guldur | Central Rhovanion south of Gladden Fields. | Lorien, Gladden Fields, Emyn Muil | None |  |
| Emyn Muil | Southeastern Rhovanion west of Dagorlad and north of Rohan. | Lorien, Dol Guldur, Emnet, Dead Marshes, Brown Lands, Dagorlad | None | Cross-region borders to Rohan and Rhun. |
| Dead Marshes | Southern Rhovanion between Rohan, Gondor, Mordor, and Dagorlad. | Emnet, Emyn Muil, Dagorlad, Udun, Minas Tirith, Eastfold | None | Cross-region borders to Rohan, Rhun, Mordor, and Gondor. |
| Moria | Western Rhovanion in the Misty Mountains. | Swanfleet, Lorien | None | Cross-region border to Swanfleet in Eriador. |

## Region: Rhun

Rhun lies east of Rhovanion and north of Mordor.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Erebor | Northwestern Rhun, east of Woodland Realm. | Woodland Realm, Iron Hills, Brown Lands | None |  |
| Iron Hills | Northern Rhun east of Erebor. | Erebor, Brown Lands, Dorwinion, Sea of Rhun | None |  |
| Sea of Rhun | Eastern Rhun around the inland sea. | Iron Hills, Dorwinion, Dagorlad, Lithlad | None | Cross-region border to Lithlad in Mordor. |
| Dorwinion | Central Rhun west of the Sea of Rhun. | Iron Hills, Sea of Rhun, Dagorlad, Brown Lands | None |  |
| Brown Lands | Western Rhun east of Emyn Muil. | Erebor, Iron Hills, Dorwinion, Dagorlad, Emyn Muil, Woodland Realm | None | Cross-region borders to Emyn Muil and Woodland Realm in Rhovanion. |
| Dagorlad | Southwestern Rhun north of Mordor and east of Dead Marshes. | Brown Lands, Dorwinion, Sea of Rhun, Dead Marshes, Emyn Muil | None | Cross-region borders to Rhovanion. |

## Region: Mordor

Mordor is the southeastern region, enclosed by mountain barriers except for the listed passes.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Udun | Northwestern Mordor, directly south of Dead Marshes. | Dead Marshes, Minas Morgul | None | The only Mordor border from Dead Marshes. |
| Lithlad | Northeastern Mordor, south of the Sea of Rhun. | Sea of Rhun, Minas Morgul, Nurn | None | Cross-region border to Sea of Rhun in Rhun. |
| Minas Morgul | Western Mordor pass through the mountains. | Minas Tirith, Udun, Lithlad, Nurn | None | The narrow pass connecting Mordor to Minas Tirith. |
| Nurn | Southern Mordor. | Minas Morgul, Lithlad | None | Mountains block Minas Tirith from Nurn. |

## Region: Gondor

Gondor is the southwestern and south-central region, west of Mordor and south of Rohan.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Druwaith Iaur | Northwestern Gondor, south of Enedwaith and Isengard. | Enedwaith, Isengard, Andrast, Anfalas | None | Cross-region borders to Enedwaith and Isengard in Eriador. |
| Andrast | Southwestern Gondor peninsula. | Druwaith Iaur, Anfalas | Harlindon, Minhiriath, Enedwaith | Receives all western dotted sea routes. |
| Anfalas | Western Gondor coast east of Andrast. | Andrast, Druwaith Iaur, Lamedon | None |  |
| Lamedon | Central Gondor east of Anfalas. | Anfalas, Belfalas | None |  |
| Belfalas | Southeastern-central Gondor coast west of Minas Tirith. | Lamedon, Minas Tirith, South Gondor | None |  |
| Minas Tirith | Eastern Gondor, west of Minas Morgul and south of Eastfold/Dead Marshes. | Belfalas, South Gondor, Minas Morgul, Dead Marshes, Eastfold | None | Mordor access is only through Minas Morgul. |
| South Gondor | Southern Gondor, south of Belfalas and Minas Tirith. | Belfalas, Minas Tirith | None |  |

## Region: Rohan

Rohan sits near the center of the map, south of Rhovanion and north of Gondor.

| Territory | Position | Land borders | Ship borders | Notes |
| --- | --- | --- | --- | --- |
| Westfold | Northwestern Rohan, east of Isengard. | Isengard, Edoras, Emnet | None | Cross-region border to Isengard in Eriador. |
| Emnet | Northern and eastern Rohan, east of Westfold and north of Eastfold. | Westfold, Edoras, Eastfold, Emyn Muil, Dead Marshes | None | Cross-region borders to Rhovanion. |
| Edoras | Southwestern Rohan, south of Westfold and west of Eastfold. | Westfold, Emnet, Eastfold | None |  |
| Eastfold | Southeastern Rohan, east of Edoras and south of Emnet. | Edoras, Emnet, Dead Marshes, Minas Tirith | None | Cross-region borders to Rhovanion and Gondor. |

## Alphabetical Territory Index

| Territory | Region | Land borders | Ship borders |
| --- | --- | --- | --- |
| Andrast | Gondor | Druwaith Iaur, Anfalas | Harlindon, Minhiriath, Enedwaith |
| Anfalas | Gondor | Andrast, Druwaith Iaur, Lamedon | None |
| Belfalas | Gondor | Lamedon, Minas Tirith, South Gondor | None |
| Bree | Eriador | Shire, North Downs, Ettenmoors, Rivendell, Swanfleet, Minhiriath | None |
| Brown Lands | Rhun | Erebor, Iron Hills, Dorwinion, Dagorlad, Emyn Muil, Woodland Realm | None |
| Caradhras | Rhovanion | Rivendell, Greylin, Woodland Realm, Gladden Fields, Lorien | None |
| Dagorlad | Rhun | Brown Lands, Dorwinion, Sea of Rhun, Dead Marshes, Emyn Muil | None |
| Dead Marshes | Rhovanion | Emnet, Emyn Muil, Dagorlad, Udun, Minas Tirith, Eastfold | None |
| Dol Guldur | Rhovanion | Lorien, Gladden Fields, Emyn Muil | None |
| Dorwinion | Rhun | Iron Hills, Sea of Rhun, Dagorlad, Brown Lands | None |
| Druwaith Iaur | Gondor | Enedwaith, Isengard, Andrast, Anfalas | None |
| Eastfold | Rohan | Edoras, Emnet, Dead Marshes, Minas Tirith | None |
| Edoras | Rohan | Westfold, Emnet, Eastfold | None |
| Emnet | Rohan | Westfold, Edoras, Eastfold, Emyn Muil, Dead Marshes | None |
| Emyn Muil | Rhovanion | Lorien, Dol Guldur, Emnet, Dead Marshes, Brown Lands, Dagorlad | None |
| Enedwaith | Eriador | Minhiriath, Swanfleet, Isengard, Druwaith Iaur | Andrast |
| Erebor | Rhun | Woodland Realm, Iron Hills, Brown Lands | None |
| Ettenmoors | Eriador | North Downs, Rivendell, Bree | None |
| Forlond | Eriador | Grey Havens | Harlindon |
| Gladden Fields | Rhovanion | Woodland Realm, Caradhras, Lorien, Dol Guldur | None |
| Grey Havens | Eriador | Forlond, Harlindon, North Downs, Shire | None |
| Greylin | Rhovanion | Caradhras, Woodland Realm | None |
| Harlindon | Eriador | Grey Havens | Forlond, Andrast |
| Iron Hills | Rhun | Erebor, Brown Lands, Dorwinion, Sea of Rhun | None |
| Isengard | Eriador | Enedwaith, Swanfleet, Westfold, Druwaith Iaur | None |
| Lamedon | Gondor | Anfalas, Belfalas | None |
| Lithlad | Mordor | Sea of Rhun, Minas Morgul, Nurn | None |
| Lorien | Rhovanion | Caradhras, Gladden Fields, Dol Guldur, Moria, Emyn Muil | None |
| Minas Morgul | Mordor | Minas Tirith, Udun, Lithlad, Nurn | None |
| Minas Tirith | Gondor | Belfalas, South Gondor, Minas Morgul, Dead Marshes, Eastfold | None |
| Minhiriath | Eriador | Shire, Bree, Swanfleet, Enedwaith | Andrast |
| Moria | Rhovanion | Swanfleet, Lorien | None |
| North Downs | Eriador | Grey Havens, Shire, Bree, Ettenmoors | None |
| Nurn | Mordor | Minas Morgul, Lithlad | None |
| Rivendell | Eriador | Ettenmoors, Bree, Swanfleet, Caradhras | None |
| Sea of Rhun | Rhun | Iron Hills, Dorwinion, Dagorlad, Lithlad | None |
| Shire | Eriador | Grey Havens, North Downs, Bree, Minhiriath | None |
| South Gondor | Gondor | Belfalas, Minas Tirith | None |
| Swanfleet | Eriador | Bree, Rivendell, Moria, Isengard, Minhiriath, Enedwaith | None |
| Udun | Mordor | Dead Marshes, Minas Morgul | None |
| Westfold | Rohan | Isengard, Edoras, Emnet | None |
| Woodland Realm | Rhovanion | Greylin, Caradhras, Gladden Fields, Erebor, Brown Lands | None |

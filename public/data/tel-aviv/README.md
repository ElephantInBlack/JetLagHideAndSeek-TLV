# Tel Aviv metro OpenStreetMap snapshot

This directory contains a one-time OpenStreetMap snapshot generated on
2026-07-15 for Tel Aviv–Yafo (relation 1382494), Ramat Gan (relation 1382493),
and Givatayim (relation 1382923), plus nearby points and a clipped local OSM
coastline used by map questions. Synthetic offshore closure points are added
to the coastline so it can be used as a bounded sea polygon.

Data © OpenStreetMap contributors and available under the Open Database
License (ODbL) 1.0: https://www.openstreetmap.org/copyright

The snapshot is intentionally not updated automatically.

Neighborhood Matching no longer uses center-point Voronoi cells. Its local
polygon snapshots were downloaded on 2026-07-17 from:

- [Tel Aviv-Yafo municipal GIS neighborhood layer 511](https://gisn.tel-aviv.gov.il/arcgis/rest/services/WM/IView2WM/MapServer/511)
  (71 polygons).
- [`Neighborhoods_2017_Revised`](https://www.arcgis.com/home/item.html?id=056a523ecca444a6a937538a561073e4)
  (39 Ramat Gan polygons), a 2017 ArcGIS layer
  documented as being based on the municipality's 2008 neighborhood layer and
  updated for approved and planned development in the east of the city.
- [Israel Central Bureau of Statistics 2022 statistical areas](https://services2.arcgis.com/xMRYm7cNgdR5RN6F/ArcGIS/rest/services/Statistical__Areas_2022/FeatureServer/0)
  for Givatayim,
  dissolved into four official sub-quarters. Givatayim publishes neighborhood
  [names and street membership](https://www.givatayim.muni.il/%D7%A9%D7%9B%D7%95%D7%A0%D7%95%D7%AA-%D7%95%D7%A8%D7%95%D7%91%D7%A2%D7%99-%D7%94%D7%A2%D7%99%D7%A8/),
  but no downloadable neighborhood polygon layer;
  the app therefore uses the official sub-quarters instead of inventing borders.

These snapshots are loaded locally and make no runtime GIS request.

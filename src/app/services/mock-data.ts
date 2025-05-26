import { GeoFeatureCollection } from '../interfaces/feature.interface';

export const IMockFeatureCollection: GeoFeatureCollection<'MultiPolygon' | 'Point' | 'LineString'> = {
  "type": "FeatureCollection",
  "features": [
  {
    "type": "Feature",
    "id": "mock.1",
    "geometry": {
      "type": "MultiPolygon",
      "coordinates": [
        [[[3743000, 5545000], [3743200, 5545000], [3743200, 5545200], [3743000, 5545200], [3743000, 5545000]]]
      ]
    },
    "geometry_name": "geom",
    "properties": {
      "gid": 1,
      "name": "Квадрат",
      "description": "Моковый квадрат",
      "color": "#00ff00",
      "border_color": "#000000",
      "user_id": 6,
      "registry_data": null
    },
    "bbox": [3743000, 5545000, 3743200, 5545200]
  },
  {
    "type": "Feature",
    "id": "mock.2",
    "geometry": {
      "type": "MultiPolygon",
      "coordinates": [
        [[[3743300, 5545000], [3743500, 5545000], [3743400, 5545200], [3743300, 5545000]]]
      ]
    },
    "geometry_name": "geom",
    "properties": {
      "gid": 2,
      "name": "Треугольник",
      "description": "Моковый треугольник",
      "color": "#ffcc00",
      "border_color": "#000000",
      "user_id": 6,
      "registry_data": null
    },
    "bbox": [3743300, 5545000, 3743500, 5545200]
  },
  {
    "type": "Feature",
    "id": "mock.3",
    "geometry": {
      "type": "MultiPolygon",
      "coordinates": [
        [[[3743600, 5545000], [3743800, 5545100], [3743900, 5544950], [3743700, 5544900], [3743600, 5545000]]]
      ]
    },
    "geometry_name": "geom",
    "properties": {
      "gid": 3,
      "name": "Полигон",
      "description": "Произвольный полигон",
      "color": "#ff00ff",
      "border_color": "#000000",
      "user_id": 6,
      "registry_data": null
    },
    "bbox": [3743600, 5544900, 3743900, 5545100]
  },
  {
    "type": "Feature",
    "id": "mock.4",
    "geometry": {
      "type": "LineString",
      "coordinates": [
        [3744000, 5544800],
        [3744100, 5544900],
        [3744200, 5544850]
      ]
    },
    "geometry_name": "geom",
    "properties": {
      "gid": 4,
      "name": "Линия",
      "description": "Моковая линия",
      "color": "#0000ff",
      "border_color": "#000000",
      "user_id": 6,
      "registry_data": null
    },
    "bbox": [3744000, 5544800, 3744200, 5544900]
  },
  {
    "type": "Feature",
    "id": "mock.5",
    "geometry": {
      "type": "Point",
      "coordinates": [3744300, 5544700]
    },
    "geometry_name": "geom",
    "properties": {
      "gid": 5,
      "name": "Точка",
      "description": "Моковая точка",
      "color": "#ff0000",
      "border_color": "#000000",
      "user_id": 6,
      "registry_data": null
    },
    "bbox": [3744300, 5544700, 3744300, 5544700]
  }
],
  "totalFeatures": 5,
  "numberMatched": 5,
  "numberReturned": 5,
  "timeStamp": "2025-05-14T12:00:00Z",
  "crs": {
  "type": "name",
    "properties": {
    "name": "urn:ogc:def:crs:EPSG::3857"
  }
},
  "bbox": [3743000, 5544700, 3744300, 5545200]
}

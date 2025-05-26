import { Coordinate } from 'ol/coordinate';

export type GeometryType =
  | 'Point'
  | 'LineString'
  | 'Polygon'
  | 'MultiPoint'
  | 'MultiLineString'
  | 'MultiPolygon';

export type CoordinatesByGeometry<T extends GeometryType> =
  T extends 'Point' ? Coordinate :
  T extends 'LineString' ? Coordinate[] :
  T extends 'Polygon' ? Coordinate[][] :
  T extends 'MultiPolygon' ? Coordinate[][][] : never;

export interface CRS {
  type: string;
  properties: {
    name: string;
  }
}

interface BaseVineyardProperties {
  border_color: string;
  color: string;
  description: string | null;
  gid: number;
  name: string;
  registry_data: string | null;
  user_id: number;
}

export interface GeoFeature<T extends GeometryType> {
  type: 'Feature';
  id: string;
  geometry: {
    type: T;
    coordinates: CoordinatesByGeometry<T>;
  };
  geometry_name: string;
  properties: BaseVineyardProperties;
  bbox: number[];
}

export interface GeoFeatureCollection<T extends GeometryType> {
  type: 'FeatureCollection';
  features: GeoFeature<T>[];
  bbox: number[];
  crs: CRS;
  numberMatched: number;
  numberReturned: number;
  timeStamp: string;
  totalFeatures: number | 'unknown';
}

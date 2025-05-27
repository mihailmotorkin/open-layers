import { Component, input } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { Geometry, LineString, Point } from 'ol/geom';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Feature, Map } from 'ol';
import { Coordinate } from 'ol/coordinate';
import * as turf from '@turf/turf';
import { Feature as GeoFeature, LineString as GeoLineString } from 'geojson';
import VectorSource from 'ol/source/Vector';
import { Circle, Fill, Style } from 'ol/style';
import VectorLayer from 'ol/layer/Vector';

@Component({
  selector: 'app-points-generator',
  imports: [
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './points-generator.component.html',
  styleUrl: './points-generator.component.css'
})
export class PointsGeneratorComponent {
  geometry = input<Geometry>();
  map = input<Map>();

  private generatedPointsVectorSource = new VectorSource();

  generatePointsForm = new FormGroup({
    distance: new FormControl<number | null>(null),
    count: new FormControl<number | null>(null),
    paddingStart: new FormControl<number | null>(null),
    paddingEnd: new FormControl<number | null>(null),
    generateEndPoint: new FormControl<boolean>(false),
    startGenerate: new FormControl<'start' | 'end'>('start'),
  })

  sanitizeNumber(data: number): number | null {
    return isNaN(data) || data === 0 ? null : data;
  }

  sanitizeFormValues<T extends Record<PropertyKey, unknown>>(values: T): T {
    return {
      ...values,
      distance: this.sanitizeNumber(Number(values['distance'])),
      count: this.sanitizeNumber(Number(values['count'])),
      paddingStart: this.sanitizeNumber(Number(values['paddingStart'])),
      paddingEnd: this.sanitizeNumber(Number(values['paddingEnd'])),
    }
  }

  hasPointInEnd(points: Coordinate[], endPoint: Coordinate | undefined) {
    if (!endPoint) {
      return false;
    }

    return points.some(point => point[0] === endPoint[0] && point[0])
  }

  sliceLine(line: GeoFeature<GeoLineString>, start: number | null, stop: number | null): GeoFeature<GeoLineString> {
    const length = turf.length(line, {units: 'meters'});
    return turf.lineSliceAlong(line, start ?? 0, length - (stop ?? 0), {units: 'meters'});
  }

  generatePoints(lineCoords: Coordinate[], options: ReturnType<typeof this.generatePointsForm['getRawValue']>): Coordinate[] {
    const pointsCoords: Coordinate[] = [];
    const line = turf.lineString(lineCoords);
    let slicedLine = this.sliceLine(line, options.paddingStart, options.paddingEnd);

    if (options.startGenerate === 'end') {
      slicedLine.geometry.coordinates.reverse();
    }

    const totalDistance = turf.length(slicedLine, {units: 'meters'});
    const step = options.distance ? options.distance : totalDistance / options.count!;
    const count = options.count ?? Infinity;
    let currentDistance = 0;

    while (currentDistance <= totalDistance && pointsCoords.length < count) {
      const line = turf.along(slicedLine, currentDistance, {units: 'meters'});
      pointsCoords.push(line.geometry.coordinates);
      currentDistance += step;
    }

    if (
      options.generateEndPoint &&
      !this.hasPointInEnd(pointsCoords, slicedLine.geometry.coordinates.at(-1))
    ) {
      pointsCoords.push(slicedLine.geometry.coordinates.at(-1)!);
    }

    return pointsCoords;
  }

  generatePointsOnLine() {
    const geometry = this.geometry();
    if (!geometry || !(geometry instanceof LineString)) {
      return;
    }

    const formData = this.sanitizeFormValues(this.generatePointsForm.getRawValue());

    if (!formData.count && !formData.distance) {
      return alert('Вы должны ввести или количество точек, или расстояние между ними!');
    }

    const lineCoords = geometry.getCoordinates().map(coord => toLonLat(coord, 'EPSG:3857'));
    const points = this.generatePoints(lineCoords, formData);

    if (!Array.isArray(points) || points.length === 0) {
      return;
    }

    points.forEach(point => {
      this.generatedPointsVectorSource
        .addFeature(new Feature({
          geometry: new Point(fromLonLat(point))
        }));
    });

    const layer = new VectorLayer({
      source: this.generatedPointsVectorSource,
      style: new Style({
        image: new Circle({
          radius: 5,
          fill: new Fill({color: 'yellow'}),
        }),
      }),
    });
    this.map()!.addLayer(layer);
  }

}

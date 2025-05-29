import { Component, input } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Geometry, LineString, MultiPolygon, Point, Polygon } from 'ol/geom';
import * as turf from '@turf/turf';
import { Coordinate } from 'ol/coordinate';
import { Feature, Map } from 'ol';
import { fromLonLat, toLonLat } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Circle, Fill, Stroke, Style } from 'ol/style';
import { Translate } from 'ol/interaction';
import Collection from 'ol/Collection';
import { GeoJSON } from 'ol/format';

@Component({
  selector: 'app-rows-generator',
  imports: [
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './rows-generator.component.html',
  styleUrl: './rows-generator.component.css'
})
export class RowsGeneratorComponent {
  map = input<Map>();
  geometry = input<Geometry>();

  private rowsPreviewLayer: VectorLayer | null = null;
  private bboxPreviewLayer: VectorLayer | null = null;
  private handleLayer: VectorLayer | null = null;
  private handleTranslate: Translate | null = null;
  private handleFeature: Feature | null = null;
  private rowLineFeatures: Feature[] = [];
  private bboxFeature: Feature<Polygon> | null = null;
  private bboxPivot: [number, number] | null = null;
  private originalBboxPolygon: any = null;
  private originalLines: any[] = [];
  private previewAngle: number = 0;
  private dragStartAngle: number | null = null;
  private dragStartPreviewAngle: number = 0;
  private rotateTimeout: any = null;
  rowsPreview: any[] = [];

  generateRowsForm = new FormGroup({
    step: new FormControl<number>(10),
    angle: new FormControl<number>(0),
    scale: new FormControl<number>(1),
  });


  previewRows(angleOverride?: number) {
    this.clearPreviewLayersAndInteractions();

    const {geometry, step, angle, scale, coords, pol} = this.preparePreviewGeometry(angleOverride);
    if (!geometry || !coords || !pol) return;

    const {bboxPolygon, bboxPivot, originalLines} = this.createBboxAndLines(pol, step ?? 10, scale ?? 1);
    this.bboxPivot = bboxPivot;
    this.originalBboxPolygon = bboxPolygon;
    this.originalLines = originalLines;

    const {rotatedBboxPolygon, rotatedLines} = this.rotateBboxAndLines(bboxPolygon, originalLines, angle, bboxPivot);
    this.rowsPreview = rotatedLines;

    this.createPreviewFeatures(rotatedBboxPolygon, rotatedLines);
    this.createPreviewLayers();
    this.addHandleTranslate();
  }

  private clearPreviewLayersAndInteractions() {
    if (this.rowsPreviewLayer) this.map()!.removeLayer(this.rowsPreviewLayer);
    if (this.bboxPreviewLayer) this.map()!.removeLayer(this.bboxPreviewLayer);
    if (this.handleLayer) this.map()!.removeLayer(this.handleLayer);
    if (this.handleTranslate) this.map()!.removeInteraction(this.handleTranslate);
  }

  private clearLayersAndInteractions(): void {
    this.removeLayerOrInteraction(this.rowsPreviewLayer, 'layer');
    this.rowsPreviewLayer = null;

    this.removeLayerOrInteraction(this.bboxPreviewLayer, 'layer');
    this.bboxPreviewLayer = null;

    this.removeLayerOrInteraction(this.handleLayer, 'layer');
    this.handleLayer = null;

    this.removeLayerOrInteraction(this.handleTranslate, 'interaction');
    this.handleTranslate = null;
  }

  private preparePreviewGeometry(angleOverride?: number) {
    const geometry = this.geometry();
    if (!geometry || !(geometry instanceof Polygon || geometry instanceof MultiPolygon)) return {};

    const {step, angle, scale} = this.generateRowsForm.getRawValue();
    const usedAngle = angleOverride !== undefined ? angleOverride : angle ?? 0;
    this.previewAngle = usedAngle;

    const coords = this.getValidPolygonCoords(geometry);
    if (!coords) {
      alert('Нет корректных контуров');
      return {};
    }

    let pol: any;
    if (geometry instanceof Polygon) {
      pol = turf.polygon(coords as Coordinate[][]);
    } else {
      pol = turf.multiPolygon(coords as Coordinate[][][]);
    }

    return {geometry, step, angle: usedAngle, scale, coords, pol};
  }

  private createBboxAndLines(pol: any, step: number, scale: number) {
    let bboxPolygon = turf.bboxPolygon(turf.bbox(pol));
    bboxPolygon = turf.transformScale(bboxPolygon, scale ?? 1);
    const bboxPivot = turf.centroid(bboxPolygon).geometry.coordinates as [number, number];

    const bbox = turf.bbox(bboxPolygon);
    const lines: any[] = [];
    for (let lon = bbox[0]; lon <= bbox[2]; lon += this.getLonStep(bbox[1], step ?? 10)) {
      let line = turf.lineString([[lon, bbox[1]], [lon, bbox[3]]]);
      lines.push(line);
    }
    return {bboxPolygon, bboxPivot, originalLines: lines};
  }

  private rotateBboxAndLines(bboxPolygon: any, lines: any[], angle: number, pivot: [number, number]) {
    const rotatedBboxPolygon = turf.transformRotate(bboxPolygon, angle, {pivot});
    const rotatedLines = lines.map(line => turf.transformRotate(line, angle, {pivot}));
    return {rotatedBboxPolygon, rotatedLines};
  }

  private toLonLatCoordinates(coordinates: any[]): any[] {
    return coordinates.map(coord => fromLonLat(coord));
  }

  private createPreviewFeatures(rotatedBboxPolygon: any, rotatedLines: any[]) {
    const bboxCoords = rotatedBboxPolygon.geometry.coordinates[0];
    const handleCoord = bboxCoords[1];

    this.bboxFeature = new Feature({
      geometry: new Polygon(
        rotatedBboxPolygon.geometry.coordinates.map((ring: any) =>
          this.toLonLatCoordinates(ring)
        )
      )
    });

    this.handleFeature = new Feature({
      geometry: new Point(fromLonLat(handleCoord)),
      name: 'rotateHandle'
    });

    this.rowLineFeatures = rotatedLines.map(line =>
      new Feature({
        geometry: new LineString(this.toLonLatCoordinates(line.geometry.coordinates))
      })
    );
  }

  private createPreviewLayers() {
    this.bboxPreviewLayer = new VectorLayer({
      source: new VectorSource({features: this.bboxFeature ? [this.bboxFeature] : []}),
      style: new Style({
        stroke: new Stroke({color: 'orange', width: 2}),
        fill: new Fill({color: 'rgba(255,165,0,0.05)'}),
      }),
      properties: {name: 'BBoxPreviewLayer'}
    });
    this.map()!.addLayer(this.bboxPreviewLayer);

    this.handleLayer = new VectorLayer({
      source: new VectorSource({features: this.handleFeature ? [this.handleFeature] : []}),
      style: new Style({
        image: new Circle({
          radius: 7,
          fill: new Fill({color: 'orange'}),
          stroke: new Stroke({color: 'black', width: 2})
        })
      }),
      properties: {name: 'HandleLayer'}
    });
    this.map()!.addLayer(this.handleLayer);

    this.rowsPreviewLayer = new VectorLayer({
      source: new VectorSource({features: this.rowLineFeatures}),
      style: new Style({
        stroke: new Stroke({color: 'blue', width: 2, lineDash: [8, 8]}),
      }),
      properties: {name: 'RowsPreviewLayer'}
    });
    this.map()!.addLayer(this.rowsPreviewLayer);
  }

  private addHandleTranslate(): void {
    this.handleTranslate = new Translate({
      features: new Collection([this.handleFeature!].filter((f): f is Feature<Geometry> => !!f)),
    });
    this.map()!.addInteraction(this.handleTranslate);

    this.handleTranslate.on('translatestart', this.onTranslateStart.bind(this));
    this.handleTranslate.on('translating', this.onTranslating.bind(this));
    this.handleTranslate.on('translateend', this.onTranslateEnd.bind(this));
  }

  private onTranslateStart(evt: any): void {
    const pivot3857 = fromLonLat(this.bboxPivot!);
    const mouse3857 = evt.coordinate;
    this.dragStartAngle = Math.atan2(mouse3857[1] - pivot3857[1], mouse3857[0] - pivot3857[0]);
    this.dragStartPreviewAngle = this.previewAngle;
  }

  private onTranslating(evt: any): void {
    if (this.rotateTimeout) return;

    this.rotateTimeout = setTimeout(() => {
      if (this.dragStartAngle === null) {
        this.rotateTimeout = null;
        return;
      }

      const pivot3857 = fromLonLat(this.bboxPivot!);
      const mouse3857 = evt.coordinate;
      const currentAngle = Math.atan2(mouse3857[1] - pivot3857[1], mouse3857[0] - pivot3857[0]);
      let delta = (this.dragStartAngle - currentAngle) * 180 / Math.PI;
      if (delta < 0) delta += 360;

      const newAngle = this.dragStartPreviewAngle + delta;
      this.previewAngle = newAngle;

      this.updateRotatedGeometry(newAngle);
      this.rotateTimeout = null;
    }, 10);
  }

  private onTranslateEnd(): void {
    this.generateRowsForm.get('angle')?.setValue(Math.round(this.previewAngle));
    this.dragStartAngle = null;
  }

  private updateRotatedGeometry(newAngle: number): void {
    const rotatedBboxPolygon = turf.transformRotate(this.originalBboxPolygon, newAngle, {
      pivot: this.bboxPivot ?? undefined,
    });
    const rotatedLines = this.originalLines.map(line =>
      turf.transformRotate(line, newAngle, { pivot: this.bboxPivot ?? undefined })
    );

    const bboxCoords = rotatedBboxPolygon.geometry.coordinates[0];
    const handleCoord = bboxCoords[1];

    this.bboxFeature!.setGeometry(
      new Polygon(
        rotatedBboxPolygon.geometry.coordinates.map((ring: any) =>
          ring.map((coord: any) => fromLonLat(coord))
        )
      )
    );
    this.handleFeature!.setGeometry(new Point(fromLonLat(handleCoord)));
    this.rowLineFeatures.forEach((f, i) => {
      f.setGeometry(new LineString(rotatedLines[i].geometry.coordinates.map((c: any) => fromLonLat(c))));
    });

    this.rowsPreview = rotatedLines;
  }

  resetRowsFormAndPreview() {
    this.generateRowsForm.reset({
      step: 10,
      angle: 0,
      scale: 1,
    });

    this.clearLayersAndInteractions();

    this.map()!.getLayers().getArray()
      .filter(l => l instanceof VectorLayer && l.get('name') === 'FinalRowsLayer')
      .forEach(l => this.map()!.removeLayer(l));

    this.resetPreviewState();
  }

  private resetPreviewState () {
    this.bboxPivot = null;
    this.originalBboxPolygon = null;
    this.originalLines = [];
    this.previewAngle = 0;
    this.rowsPreview = [];
  }

  generateRows() {
    if (this.rowsPreviewLayer) {
      this.map()!.removeLayer(this.rowsPreviewLayer);
      this.rowsPreviewLayer = null;
    }

    this.previewRows();
  }

  saveRows() {
    const polygon = this.validateGeometry();
    if (!polygon) return;

    const resultSegments = this.clipRowsByPolygon(this.rowsPreview, polygon);

    this.clearLayersAndInteractions();
    this.resetPreviewState();
    this.addRowsToMap(resultSegments);
  }


  private closeAndValidateRing(ring: Coordinate[]): Coordinate[] | null {
    if (!ring || ring.length < 3) return null;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring = [...ring, first];
    }
    if (ring.length < 4) return null;
    return ring;
  }

  private processPolygonCoordinates(coords: Coordinate[][]): Coordinate[][] {
    return coords
      .map(ring => this.closeAndValidateRing(ring.map(point => toLonLat(point))))
      .filter((ring): ring is Coordinate[] => !!ring && ring.length >= 4);
  }

  private getValidPolygonCoords(geometry: Polygon | MultiPolygon): Coordinate[][] | Coordinate[][][] | null {
    if (geometry instanceof Polygon) {
      const coords = this.processPolygonCoordinates(geometry.getCoordinates());
      return coords.length ? coords : null;
    } else if (geometry instanceof MultiPolygon) {
      const coords = geometry.getCoordinates()
        .map(polygon => this.processPolygonCoordinates(polygon))
        .filter(poly => poly.length > 0);
      return coords.length ? coords : null;
    }
    return null;
  }

  private getLonStep(lat: number, stepMeters: number): number {
    const latRad = lat * Math.PI / 180;
    const stepKm = stepMeters / 1000;
    return stepKm / (111.32 * Math.cos(latRad));
  }

  private createLineFeature(coordinates: any[]): Feature<LineString> {
    return new Feature({
      geometry: new LineString(this.toLonLatCoordinates(coordinates)),
    });
  }

  private addRowsToMap(lines: any[]): void {
    const source = new VectorSource({
      features: lines.map(line => this.createLineFeature(line.geometry.coordinates)),
    });

    const layer = new VectorLayer({
      source,
      style: new Style({
        stroke: new Stroke({
          color: 'red',
          width: 2,
        }),
      }),
      properties: { name: 'FinalRowsLayer' },
    });

    this.map()!.addLayer(layer);
  }

  private removeLayerOrInteraction(item: VectorLayer | Translate | null, type: 'layer' | 'interaction') {
    if (!item) return;

    if (type === 'layer') {
      this.map()!.removeLayer(item as VectorLayer);
    } else if (type === 'interaction') {
      this.map()!.removeInteraction(item as Translate);
    }
  }

  private validateGeometry(): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
    const geometry = this.geometry();
    if (!geometry || !(geometry instanceof Polygon || geometry instanceof MultiPolygon)) return null;

    const coords = this.getValidPolygonCoords(geometry);
    if (!coords) {
      alert('Нет корректных контуров');
      return null;
    }

    return geometry instanceof Polygon
      ? turf.polygon(coords as Coordinate[][])
      : turf.multiPolygon(coords as Coordinate[][][]);
  }

  private clipRowsByPolygon(rows: any[], polygon: any): any[] {
    const resultSegments: any[] = [];
    rows.forEach(line => {
      const split = turf.lineSplit(line, polygon);

      split.features.forEach(segment => {
        const segmentLength = turf.length(segment, { units: 'meters' });
        if (segmentLength > 0) {
          const center = turf.along(segment, segmentLength / 2, { units: 'meters' });
          if (turf.booleanPointInPolygon(center, polygon)) {
            resultSegments.push(segment);
          }
        }
      });
    });
    return resultSegments;
  }
}

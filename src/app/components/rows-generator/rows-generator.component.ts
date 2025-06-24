import { Component, input, signal, computed } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Geometry, LineString, MultiPolygon, Point, Polygon } from 'ol/geom';
import * as turf from '@turf/turf';
import { Coordinate } from 'ol/coordinate';
import { Feature, Map, MapBrowserEvent } from 'ol';
import { fromLonLat, toLonLat } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Circle, Fill, Stroke, Style } from 'ol/style';
import { MouseWheelZoom, Translate } from 'ol/interaction';
import Collection from 'ol/Collection';
import PointerInteraction from 'ol/interaction/Pointer';
import type {
  Feature as TurfFeature,
  LineString as TurfLineString,
  Polygon as TurfPolygon,
  MultiPolygon as TurfMultiPolygon,
  Geometry as TurfGeometry
} from 'geojson';

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
  private unifiedTranslate: Translate | null = null;
  private handleFeature: Feature | null = null;
  private handleRotateInteraction: PointerInteraction | null = null;
  private rowLineFeatures: Feature[] = [];
  private bboxFeature: Feature<Polygon> | null = null;
  private dragStartAngle: number | null = null;
  private dragStartPreviewAngle: number = 0;
  private rotateTimeout: any = null;
  private wheelZoomInteraction: any = null;

  private dragStartBbox: Coordinate[] | null = null;
  private dragStartPivot: Coordinate | null = null;

  // Единый источник правды
  private sourceBbox = signal<Coordinate[] | null>(null);
  private pivot = signal<Coordinate | null>(null);
  private angle = signal<number>(0);

  // Вычисляемые значения
  private bbox = computed(() => {
    const src = this.sourceBbox();
    const a = this.angle();
    const p = this.pivot();
    if (!src || !p) return null;
    return turf.transformRotate(turf.polygon([src]), a, { pivot: p }).geometry.coordinates[0] as Coordinate[];
  });

  public lines = computed(() => {
    const src = this.sourceBbox();
    const a = this.angle();
    const p = this.pivot();
    if (!src || !p) return [];
    const lines = this.createLinesForBbox(src, this.generateRowsForm.value.step ?? 10);
    return lines.map(line => turf.transformRotate(line, a, { pivot: p }));
  });

  generateRowsForm = new FormGroup({
    step: new FormControl<number>(10),
    angle: new FormControl<number>(0),
    scale: new FormControl<number>(1, Validators.min(1)),
    direction: new FormControl<'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top'>('left-to-right'),
  });

  resetRowsFormAndPreview() {
    this.generateRowsForm.reset({
      step: 10,
      angle: 0,
      scale: 1,
      direction: 'left-to-right',
    });
    this.resetAll();
  }

  generateRows() {
    this.generateRowsForm.markAllAsTouched();
    this.generateRowsForm.updateValueAndValidity();

    if (!this.generateRowsForm.valid) return;

    this.resetAll();
    this.generatePreview(
      this.generateRowsForm.value.step ?? 10,
      this.generateRowsForm.value.angle ?? 0,
      this.generateRowsForm.value.scale ?? 1
    );
  }

  saveRows() {
    const polygon = this.validateGeometry();
    if (!polygon) return;

    const segments = this.clipRowsByPolygon(this.lines(), polygon);
    const direction = this.generateRowsForm.value.direction!;
    const firstLineIndex = this.findFirstLineIndex(segments, direction);
    this.resetAll();
    this.addRowsToMap(segments, firstLineIndex);
  }

  private findFirstLineIndex(lines: any[], direction: string): number {
    if (lines.length === 0) return -1;

    return lines.reduce((firstLineIndex, line, i) => {
      const coords = line.geometry.coordinates;
      const currentMid = coords[Math.floor(coords.length / 2)];
      const candidateMid = lines[firstLineIndex]?.geometry.coordinates[Math.floor(lines[firstLineIndex].geometry.coordinates.length / 2)];

      switch (direction) {
        case 'left-to-right':
          return currentMid[0] < candidateMid[0] ? i : firstLineIndex;
        case 'right-to-left':
          return currentMid[0] > candidateMid[0] ? i : firstLineIndex;
        case 'bottom-to-top':
          return currentMid[1] < candidateMid[1] ? i : firstLineIndex;
        case 'top-to-bottom':
          return currentMid[1] > candidateMid[1] ? i : firstLineIndex;
        default:
          return firstLineIndex;
      }
    }, 0);
  }

  private addRowsToMap(lines: any[], highlightedIndex: number = -1): void {
    const source = new VectorSource({
      features: lines.map((line, index) => {
        const feature = this.createLineFeature(line.geometry.coordinates);
        feature.set('isFirst', index === highlightedIndex);
        return feature;
      }),
    });

    const layer = new VectorLayer({
      source,
      style: (feature) => {
        const isFirst = feature.get('isFirst');
        return new Style({
          stroke: new Stroke({
            color: isFirst ? 'tomato' : 'orange',
            width: 2,
          }),
        });
      },
      properties: { name: 'FinalRowsLayer' },
    });

    this.map()!.addLayer(layer);
  }

  private generatePreview(step: number, angle: number, scale: number) {
    const geometry = this.geometry();
    if (!geometry || !(geometry instanceof Polygon || geometry instanceof MultiPolygon)) return;
    const coords = this.getValidPolygonCoords(geometry);
    if (!coords) return;

    const pol = geometry instanceof Polygon
      ? turf.polygon(coords as Coordinate[][])
      : turf.multiPolygon(coords as Coordinate[][][]);

    let bboxPolygon = turf.bboxPolygon(turf.bbox(pol));
    bboxPolygon = turf.transformScale(bboxPolygon, scale ?? 1);
    const bboxCoords = bboxPolygon.geometry.coordinates[0] as Coordinate[];
    if (bboxCoords.length < 4) return;
    const pivot = turf.centroid(bboxPolygon).geometry.coordinates as Coordinate;

    this.sourceBbox.set(bboxCoords);
    this.pivot.set(pivot);
    this.angle.set(angle);

    // Создаём features и слои только один раз
    this.initPreviewFeaturesAndLayers();
    this.addHandleRotateInteraction();
    this.addBboxTranslate();
    this.drawPreview();

    const interactions = this.map()!.getInteractions().getArray();
    this.wheelZoomInteraction = interactions.find(i => i instanceof MouseWheelZoom);

    if (this.wheelZoomInteraction) {
      this.wheelZoomInteraction.setActive(false);
    }

    this.map()?.getViewport().addEventListener('wheel', this.onMouseOverMap, { passive: false });

  }

  private initPreviewFeaturesAndLayers() {
    // bbox feature
    if (!this.bboxFeature) {
      this.bboxFeature = new Feature({
        geometry: new Polygon([[[0, 0], [0, 0], [0, 0], [0, 0]]])
      });
    }
    // handle feature
    if (!this.handleFeature) {
      this.handleFeature = new Feature({
        geometry: new Point([0, 0])
      });
    }
    // линии features
    if (!this.rowLineFeatures || this.rowLineFeatures.length === 0) {
      this.rowLineFeatures = [];
      // создаём пустые features, потом обновим геометрию
    }
    // слои
    if (!this.bboxPreviewLayer) {
      this.bboxPreviewLayer = new VectorLayer({
        source: new VectorSource({ features: [this.bboxFeature] }),
        style: new Style({
          stroke: new Stroke({ color: 'orange', width: 2 }),
          fill: new Fill({ color: 'rgba(255, 165, 0, 0.05)' })
        }),
      });
      this.map()!.addLayer(this.bboxPreviewLayer);
    }
    if (!this.handleLayer) {
      this.handleLayer = new VectorLayer({
        source: new VectorSource({ features: [this.handleFeature] }),
        style: new Style({
          image: new Circle({
            radius: 7,
            fill: new Fill({ color: 'yellow' }),
            stroke: new Stroke({ color: 'orange', width: 2 }),
          }),
        }),
      });
      this.map()!.addLayer(this.handleLayer);
    }
    if (!this.rowsPreviewLayer) {
      this.rowsPreviewLayer = new VectorLayer({
        source: new VectorSource({ features: this.rowLineFeatures }),
        style: new Style({
          stroke: new Stroke({ color: 'blue', width: 2, lineDash: [8, 8] }),
        }),
      });
      this.map()!.addLayer(this.rowsPreviewLayer);
    }
  }

  private drawPreview(bboxOverride?: Coordinate[], linesOverride?: TurfFeature<TurfLineString>[], pivotOverride?: Coordinate) {
    const bbox = bboxOverride || this.bbox();
    const lines = linesOverride || this.lines();
    const pivot = pivotOverride || this.pivot();
    if (!bbox || !lines || !pivot) return;
    // bbox
    if (this.bboxFeature) {
      (this.bboxFeature.getGeometry() as Polygon).setCoordinates([
        bbox.map(coord => fromLonLat(coord))
      ]);
    }
    // handle
    if (this.handleFeature) {
      const handleCoord = bbox[1];
      (this.handleFeature.getGeometry() as Point).setCoordinates(fromLonLat(handleCoord));
    }
    // lines
    if (this.rowLineFeatures.length !== lines.length) {
      this.rowLineFeatures = lines.map(line =>
        new Feature({
          geometry: new LineString(line.geometry.coordinates.map((coord: any) => fromLonLat(coord)))
        })
      );
      if (this.rowsPreviewLayer) {
        (this.rowsPreviewLayer.getSource() as VectorSource).clear();
        (this.rowsPreviewLayer.getSource() as VectorSource).addFeatures(this.rowLineFeatures);
      }
    } else {
      this.rowLineFeatures.forEach((feature, i) => {
        (feature.getGeometry() as LineString).setCoordinates(
          lines[i].geometry.coordinates.map((coord: Coordinate) => fromLonLat(coord))
        );
      });
    }
  }

  // --- Перемещение bbox ---
  private addBboxTranslate() {
    if (this.unifiedTranslate) return;
    this.unifiedTranslate = new Translate({
      features: new Collection([
        this.bboxFeature!,
      ]),
    });
    this.map()!.addInteraction(this.unifiedTranslate);
    this.unifiedTranslate.on('translatestart', this.onBboxTranslateStart.bind(this));
    this.unifiedTranslate.on('translating', this.onBboxTranslating.bind(this));
    this.unifiedTranslate.on('translateend', this.onBboxTranslateEnd.bind(this));
  }

  private onBboxTranslateStart() {
    this.dragStartBbox = this.sourceBbox();
    this.dragStartPivot = this.pivot();
  }

  private calculateMovedBboxAndPivot() {
    if (!this.dragStartBbox || !this.dragStartPivot) return null;

    const currentCenter = turf.centroid(turf.polygon([this.getCurrentBboxFromMap()])).geometry.coordinates as Coordinate;
    const dx = currentCenter[0] - this.dragStartPivot[0];
    const dy = currentCenter[1] - this.dragStartPivot[1];

    const movedBbox = this.dragStartBbox.map(([x, y]) => [x + dx, y + dy] as Coordinate);
    const movedPivot: Coordinate = [this.dragStartPivot[0] + dx, this.dragStartPivot[1] + dy];

    return { movedBbox, movedPivot };
  }

  private onBboxTranslating() {
    if (!this.calculateMovedBboxAndPivot()) return;

    const { movedBbox, movedPivot } = this.calculateMovedBboxAndPivot()!;
    // Ряды вычисляем из movedBbox и текущего angle
    const rotatedBbox = turf.transformRotate(turf.polygon([movedBbox]), this.angle(), { pivot: movedPivot }).geometry.coordinates[0] as Coordinate[];
    const lines = this.createLinesForBbox(movedBbox, this.generateRowsForm.value.step ?? 10)
      .map(line => turf.transformRotate(line, this.angle(), { pivot: movedPivot }));
    this.drawPreview(rotatedBbox, lines, movedPivot);
  }

  private onBboxTranslateEnd() {
    if (!this.calculateMovedBboxAndPivot()) return;

    const { movedBbox, movedPivot } = this.calculateMovedBboxAndPivot()!;
    this.sourceBbox.set(movedBbox);
    this.pivot.set(movedPivot);
    this.drawPreview();
    this.dragStartBbox = null;
    this.dragStartPivot = null;
  }

  // --- Вращение bbox ---
  private addHandleRotateInteraction() {
    if (this.handleRotateInteraction) {
      this.map()!.removeInteraction(this.handleRotateInteraction);
    }

    let isRotating = false;

    this.handleRotateInteraction = new PointerInteraction({
      handleDownEvent: (evt) => {
        const feature = this.map()!.forEachFeatureAtPixel(evt.pixel, f => f);
        if (feature === this.handleFeature) {
          isRotating = true;
          this.onTranslateStart(evt);
          return true;
        }
        return false;
      },
      handleDragEvent: (evt) => {
        if (isRotating) {
          this.onTranslating(evt);
        }
      },
      handleUpEvent: (evt) => {
        if (isRotating) {
          this.onTranslateEnd();
          isRotating = false;
          return true;
        }
        return false;
      }
    });

    this.map()!.addInteraction(this.handleRotateInteraction);
  }

  private onRotate(newAngle: number) {
    this.angle.set(newAngle);
    this.drawPreview();
  }

  // --- Вспомогательные методы для вращения ---
  private onTranslateStart(evt: MapBrowserEvent<UIEvent>) {
    const pivot = this.pivot();
    if (!pivot) return;
    const pivot3857 = fromLonLat(pivot);
    const mouse3857 = evt.coordinate;
    this.dragStartAngle = Math.atan2(mouse3857[1] - pivot3857[1], mouse3857[0] - pivot3857[0]);
    this.dragStartPreviewAngle = this.angle();
  }

  private onTranslating(evt: MapBrowserEvent<UIEvent>) {
    if (this.rotateTimeout || this.dragStartAngle === null) return;
    const pivot = this.pivot();
    if (!pivot) return;
    this.rotateTimeout = setTimeout(() => {
      try {
        const pivot3857 = fromLonLat(pivot);
        const mouse3857 = evt.coordinate;
        const currentAngle = Math.atan2(mouse3857[1] - pivot3857[1], mouse3857[0] - pivot3857[0]);
        let delta = (this.dragStartAngle! - currentAngle) * 180 / Math.PI;
        if (delta < 0) delta += 360;
        const newAngle = this.dragStartPreviewAngle + delta;
        this.onRotate(newAngle);
      } catch (error) {
        console.error('Error during rotation:', error);
      } finally {
        this.rotateTimeout = null;
      }
    }, 10);
  }

  private onTranslateEnd() {
    this.generateRowsForm.get('angle')?.setValue(Math.round(this.angle()));
    this.dragStartAngle = null;
  }

  private createLinesForBbox(
    bboxCoords: Coordinate[],
    step: number
  ): TurfFeature<TurfLineString>[] {
    // Пример генерации параллельных линий внутри bbox (можно заменить на свою логику)
    // Здесь просто создаются вертикальные линии с шагом step
    const [minX, minY] = bboxCoords.reduce(
      ([minX, minY], [x, y]) => [Math.min(minX, x), Math.min(minY, y)],
      [bboxCoords[0][0], bboxCoords[0][1]]
    );
    const [maxX, maxY] = bboxCoords.reduce(
      ([maxX, maxY], [x, y]) => [Math.max(maxX, x), Math.max(maxY, y)],
      [bboxCoords[0][0], bboxCoords[0][1]]
    );

    const lines: TurfFeature<TurfLineString>[] = [];
    let x = minX;
    while (x <= maxX) {
      lines.push(turf.lineString([
        [x, minY],
        [x, maxY]
      ]));
      x += this.getLonStep((minY + maxY) / 2, step);
    }
    return lines;
  }

  private getCurrentBboxFromMap(): Coordinate[] {
    // Получаем bbox из карты (lonlat)
    const coords3857 = (this.bboxFeature!.getGeometry() as Polygon).getCoordinates()[0];
    return coords3857
      .map(coord => toLonLat(coord))
      .filter((c): c is Coordinate => Array.isArray(c) && c.length === 2 && typeof c[0] === 'number' && typeof c[1] === 'number');
  }

  // --- Очистка ---
  private clearPreviewLayersAndInteractions() {
    if (this.rowsPreviewLayer) this.map()!.removeLayer(this.rowsPreviewLayer);
    if (this.bboxPreviewLayer) this.map()!.removeLayer(this.bboxPreviewLayer);
    if (this.handleLayer) this.map()!.removeLayer(this.handleLayer);
    if (this.handleRotateInteraction) this.map()!.removeInteraction(this.handleRotateInteraction);
    if (this.unifiedTranslate) this.map()!.removeInteraction(this.unifiedTranslate);
    this.rowsPreviewLayer = null;
    this.bboxPreviewLayer = null;
    this.handleLayer = null;
    this.handleRotateInteraction = null;
    this.unifiedTranslate = null;
  }

  private resetPreviewState() {
    this.sourceBbox.set(null);
    this.pivot.set(null);
    this.angle.set(0);
  }

  private resetAll() {
    this.clearPreviewLayersAndInteractions();
    this.resetPreviewState();
    // Удаляем итоговые слои
    this.map()!.getLayers().getArray()
      .filter(l => l instanceof VectorLayer && l.get('name') === 'FinalRowsLayer')
      .forEach(l => this.map()!.removeLayer(l));

    this.map()?.getViewport().removeEventListener('wheel', this.onMouseOverMap);
    if (this.wheelZoomInteraction) {
      this.wheelZoomInteraction.setActive(true);
      this.wheelZoomInteraction = null;
    }
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

  private createLineFeature(coordinates: unknown[]): Feature<LineString> {
    return new Feature({
      geometry: new LineString(this.toLonLatCoordinates(coordinates)),
    });
  }

  private toLonLatCoordinates(coordinates: any[]) {
    if (Array.isArray(coordinates) && Array.isArray(coordinates[0])) {
      return coordinates.map(coord => fromLonLat(coord));
    }
    return fromLonLat(coordinates);
  }

  private validateGeometry() {
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

  private clipRowsByPolygon(
    rows: TurfFeature<TurfLineString>[],
    polygon: TurfFeature<TurfPolygon | TurfMultiPolygon>
  ): TurfFeature<TurfLineString>[]
  {
    return rows.flatMap(line => {
      const segments = this.getClippedSegments(line, polygon);

      if (segments.length > 0) {
        return segments;
      }

      if (this.isLineCenterInsidePolygon(line, polygon)) {
        return [line];
      }

      return [];
    });
  }

  private getClippedSegments(line: TurfFeature<TurfLineString>, polygon: TurfFeature<TurfPolygon | TurfMultiPolygon>): TurfFeature<TurfLineString>[] {
    const result: TurfFeature<TurfLineString>[] = [];
    const segments = turf.lineSplit(line, polygon).features;

    for (const segment of segments) {
      if (this.isSegmentInsidePolygon(segment, polygon)) {
        result.push(segment);
      }
    }

    return result;
  }

  private isSegmentInsidePolygon(segment: TurfFeature<TurfLineString>, polygon: TurfFeature<TurfPolygon | TurfMultiPolygon>): boolean {
    const length = turf.length(segment, { units: 'meters' });
    if (length === 0) return false;

    const midpoint = turf.along(segment, length / 2, { units: 'meters' });
    return turf.booleanPointInPolygon(midpoint, polygon, { ignoreBoundary: false });
  }

  private isLineCenterInsidePolygon(line: TurfFeature<TurfLineString>, polygon: TurfFeature<TurfPolygon | TurfMultiPolygon>): boolean {
    const mid = turf.along(line, turf.length(line, { units: 'meters' }) / 2, { units: 'meters' });
    return turf.booleanPointInPolygon(mid, polygon, { ignoreBoundary: false });
  }

  private onBboxScale = (event: WheelEvent) => {
    if (!this.sourceBbox() || !this.pivot) return;

    const scaleControl = this.generateRowsForm.get('scale');
    if (!scaleControl) return;

    const currentScale = scaleControl.value ?? 1;
    const delta = -event.deltaY * 0.001;
    let newScale = Math.max(1, currentScale + delta);
    newScale = Math.round(newScale * 100) / 100;
    scaleControl.setValue(newScale, { emitEvent: false });

    this.generatePreview(
      this.generateRowsForm.value.step ?? 10,
      this.generateRowsForm.value.angle ?? 0,
      newScale
    );
  }

  onMouseOverMap = (event: WheelEvent) => {
    if (!this.bboxFeature || !this.map()) return;

    const pixel = this.map()!.getEventPixel(event);
    const coordinate = this.map()!.getCoordinateFromPixel(pixel);
    const geometry = this.bboxFeature.getGeometry();

    const inside = geometry?.intersectsCoordinate(coordinate) ?? false;

    if (inside) {
      event.preventDefault();
      this.wheelZoomInteraction?.setActive(false);
      this.onBboxScale(event);
    } else {
      this.wheelZoomInteraction?.setActive(true);
    }
  };

}

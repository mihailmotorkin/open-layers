import { Component, input, signal, computed } from '@angular/core';
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
import PointerInteraction from 'ol/interaction/Pointer';

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

  private dragStartBbox: [number, number][] | null = null;
  private dragStartPivot: [number, number] | null = null;

  // Единый источник правды
  private sourceBbox = signal<[number, number][] | null>(null);
  private pivot = signal<[number, number] | null>(null);
  private angle = signal<number>(0);

  // Вычисляемые значения
  private bbox = computed(() => {
    const src = this.sourceBbox();
    const a = this.angle();
    const p = this.pivot();
    if (!src || !p) return null;
    return turf.transformRotate(turf.polygon([src]), a, { pivot: p }).geometry.coordinates[0] as [number, number][];
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
    scale: new FormControl<number>(1),
  });

  resetRowsFormAndPreview() {
    this.generateRowsForm.reset({
      step: 10,
      angle: 0,
      scale: 1,
    });
    this.resetAll();
  }

  generateRows() {
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
    const resultSegments = this.clipRowsByPolygon(this.lines(), polygon);
    this.resetAll();
    this.addRowsToMap(resultSegments);
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

  private generatePreview(step: number, angle: number, scale: number) {
    const geometry = this.geometry();
    if (!geometry || !(geometry instanceof Polygon || geometry instanceof MultiPolygon)) return;
    const coords = this.getValidPolygonCoords(geometry);
    if (!coords) return;

    const pol = geometry instanceof Polygon
      ? turf.polygon(coords as [number, number][][])
      : turf.multiPolygon(coords as [number, number][][][]);

    let bboxPolygon = turf.bboxPolygon(turf.bbox(pol));
    bboxPolygon = turf.transformScale(bboxPolygon, scale ?? 1);
    const bboxCoords = bboxPolygon.geometry.coordinates[0] as [number, number][];
    if (bboxCoords.length < 4) return;
    const pivot = turf.centroid(bboxPolygon).geometry.coordinates as [number, number];

    this.sourceBbox.set(bboxCoords);
    this.pivot.set(pivot);
    this.angle.set(angle);

    // Создаём features и слои только один раз
    this.initPreviewFeaturesAndLayers();
    this.addHandleRotateInteraction();
    this.addBboxTranslate();
    this.drawPreview();
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

  private drawPreview(bboxOverride?: [number, number][], linesOverride?: any[], pivotOverride?: [number, number]) {
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
          lines[i].geometry.coordinates.map((coord: any) => fromLonLat(coord))
        );
      });
    }
  }

  // --- Перемещение bbox ---
  private addBboxTranslate(): void {
    if (this.unifiedTranslate) return; // только один раз
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

  private onBboxTranslateStart(evt: any) {
    this.dragStartBbox = this.sourceBbox();
    this.dragStartPivot = this.pivot();
  }

  private onBboxTranslating(evt: any) {
    if (!this.dragStartBbox || !this.dragStartPivot) return;
    // Центр bboxFeature (lonlat)
    const currentCenter = turf.centroid(turf.polygon([this.getCurrentBboxFromMap()])).geometry.coordinates as [number, number];
    const startCenter = this.dragStartPivot;
    const dx = currentCenter[0] - startCenter[0];
    const dy = currentCenter[1] - startCenter[1];
    // Сдвигаем исходный bbox и pivot
    const movedBbox = this.dragStartBbox.map(([x, y]) => [x + dx, y + dy] as [number, number]);
    const movedPivot: [number, number] = [this.dragStartPivot[0] + dx, this.dragStartPivot[1] + dy];
    // Ряды вычисляем из movedBbox и текущего angle
    const rotatedBbox = turf.transformRotate(turf.polygon([movedBbox]), this.angle(), { pivot: movedPivot }).geometry.coordinates[0] as [number, number][];
    const lines = this.createLinesForBbox(movedBbox, this.generateRowsForm.value.step ?? 10)
      .map(line => turf.transformRotate(line, this.angle(), { pivot: movedPivot }));
    this.drawPreview(rotatedBbox, lines, movedPivot);
  }

  private onBboxTranslateEnd(evt: any) {
    if (!this.dragStartBbox || !this.dragStartPivot) return;
    // Аналогично translating
    const currentCenter = turf.centroid(turf.polygon([this.getCurrentBboxFromMap()])).geometry.coordinates as [number, number];
    const startCenter = this.dragStartPivot;
    const dx = currentCenter[0] - startCenter[0];
    const dy = currentCenter[1] - startCenter[1];
    const movedBbox = this.dragStartBbox.map(([x, y]) => [x + dx, y + dy] as [number, number]);
    const movedPivot: [number, number] = [this.dragStartPivot[0] + dx, this.dragStartPivot[1] + dy];
    this.sourceBbox.set(movedBbox);
    this.pivot.set(movedPivot);
    this.drawPreview();
    this.dragStartBbox = null;
    this.dragStartPivot = null;
  }

  // --- Вращение bbox ---
  private addHandleRotateInteraction(): void {
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
  private onTranslateStart(evt: any): void {
    const pivot = this.pivot();
    if (!pivot) return;
    const pivot3857 = fromLonLat(pivot);
    const mouse3857 = evt.coordinate;
    this.dragStartAngle = Math.atan2(mouse3857[1] - pivot3857[1], mouse3857[0] - pivot3857[0]);
    this.dragStartPreviewAngle = this.angle();
  }

  private onTranslating(evt: any): void {
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

  private onTranslateEnd(): void {
    this.generateRowsForm.get('angle')?.setValue(Math.round(this.angle()));
    this.dragStartAngle = null;
  }

  private createLinesForBbox(
    bboxCoords: [number, number][],
    step: number
  ): any[] {
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

    const lines: any[] = [];
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

  private getCurrentBboxFromMap(): [number, number][] {
    // Получаем bbox из карты (lonlat)
    const coords3857 = (this.bboxFeature!.getGeometry() as Polygon).getCoordinates()[0];
    return coords3857
      .map(coord => toLonLat(coord))
      .filter((c): c is [number, number] => Array.isArray(c) && c.length === 2 && typeof c[0] === 'number' && typeof c[1] === 'number');
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

  private toLonLatCoordinates(coordinates: any[]): any[] {
    if (Array.isArray(coordinates) && Array.isArray(coordinates[0])) {
      return coordinates.map(coord => fromLonLat(coord));
    }
    return fromLonLat(coordinates);
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

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

  rowsPreviewLayer: VectorLayer | null = null;
  bboxPreviewLayer: VectorLayer | null = null;
  handleLayer: VectorLayer | null = null;

  handleTranslate: Translate | null = null;
  handleFeature: Feature | null = null;
  rowLineFeatures: Feature[] = [];

  bboxFeature: Feature | null = null;
  rowsPreview: any[] = [];
  bboxPivot: [number, number] | null = null;
  originalBboxPolygon: any = null;
  originalLines: any[] = [];
  previewAngle: number = 0;

  private dragStartAngle: number | null = null;
  private dragStartPreviewAngle: number = 0;
  private rotateTimeout: any = null;

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

  // --- Вспомогательные методы ---

  private clearPreviewLayersAndInteractions() {
    if (this.rowsPreviewLayer) this.map()!.removeLayer(this.rowsPreviewLayer);
    if (this.bboxPreviewLayer) this.map()!.removeLayer(this.bboxPreviewLayer);
    if (this.handleLayer) this.map()!.removeLayer(this.handleLayer);
    if (this.handleTranslate) this.map()!.removeInteraction(this.handleTranslate);
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

  private createPreviewFeatures(rotatedBboxPolygon: any, rotatedLines: any[]) {
    const bboxCoords = rotatedBboxPolygon.geometry.coordinates[0];
    const handleCoord = bboxCoords[1];

    this.bboxFeature = new Feature({
      geometry: new Polygon(
        rotatedBboxPolygon.geometry.coordinates.map((ring: any) =>
          ring.map((coord: any) => fromLonLat(coord))
        )
      )
    });

    this.handleFeature = new Feature({
      geometry: new Point(fromLonLat(handleCoord)),
      name: 'rotateHandle'
    });

    this.rowLineFeatures = rotatedLines.map(line =>
      new Feature({
        geometry: new LineString(line.geometry.coordinates.map((c: any) => fromLonLat(c)))
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

  private addHandleTranslate() {
    this.handleTranslate = new Translate({features: new Collection([this.handleFeature!].filter((f): f is Feature<Geometry> => !!f))});
    this.map()!.addInteraction(this.handleTranslate);

    this.handleTranslate.on('translatestart', (evt) => {
      const pivot3857 = fromLonLat(this.bboxPivot!);
      const mouse3857 = evt.coordinate;
      this.dragStartAngle = Math.atan2(mouse3857[1] - pivot3857[1], mouse3857[0] - pivot3857[0]);
      this.dragStartPreviewAngle = this.previewAngle;
    });

    this.handleTranslate.on('translating', (evt) => {
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

        const rotatedBboxPolygon = turf.transformRotate(this.originalBboxPolygon, newAngle, {pivot: this.bboxPivot ?? undefined});
        const rotatedLines = this.originalLines.map(line => turf.transformRotate(line, newAngle, {pivot: this.bboxPivot ?? undefined}));
        const bboxCoords = rotatedBboxPolygon.geometry.coordinates[0];
        const handleCoord = bboxCoords[1];

        this.bboxFeature!.setGeometry(new Polygon(
          rotatedBboxPolygon.geometry.coordinates.map((ring: any) =>
            ring.map((coord: any) => fromLonLat(coord))
          )
        ));
        this.handleFeature!.setGeometry(new Point(fromLonLat(handleCoord)));
        this.rowLineFeatures.forEach((f, i) => {
          f.setGeometry(new LineString(rotatedLines[i].geometry.coordinates.map((c: any) => fromLonLat(c))));
        });

        this.rowsPreview = rotatedLines;
        this.rotateTimeout = null;
      }, 10);
    });

    this.handleTranslate.on('translateend', () => {
      this.generateRowsForm.get('angle')?.setValue(Math.round(this.previewAngle));
      this.dragStartAngle = null;
    });
  }

  // Очистка формы и предпросмотра
  resetRowsFormAndPreview() {
    this.generateRowsForm.reset({
      step: 10,
      angle: 0,
      scale: 1
    });

    // Удаляем предпросмотр и ряды с карты
    if (this.rowsPreviewLayer) {
      this.map()!.removeLayer(this.rowsPreviewLayer);
      this.rowsPreviewLayer = null;
    }
    if (this.bboxPreviewLayer) {
      this.map()!.removeLayer(this.bboxPreviewLayer);
      this.bboxPreviewLayer = null;
    }
    if (this.handleLayer) {
      this.map()!.removeLayer(this.handleLayer);
      this.handleLayer = null;
    }
    if (this.handleTranslate) {
      this.map()!.removeInteraction(this.handleTranslate);
      this.handleTranslate = null;
    }

    // Удаляем все финальные (красные) ряды
    this.map()!.getLayers().getArray()
      .filter(l => l instanceof VectorLayer && l.get('name') === 'FinalRowsLayer')
      .forEach(l => this.map()!.removeLayer(l));

    this.bboxPivot = null;
    this.originalBboxPolygon = null;
    this.originalLines = [];
    this.previewAngle = 0;
    this.rowsPreview = [];
  }

  // Кнопка "Сгенерировать"
  generateRows() {
    // Удаляем старые предпросмотренные ряды
    if (this.rowsPreviewLayer) {
      this.map()!.removeLayer(this.rowsPreviewLayer);
      this.rowsPreviewLayer = null;
    }
    // Генерируем новые ряды для выбранной геометрии
    this.previewRows();
  }

  // Кнопка "Сохранить"
  saveRows() {
    const geometry = this.geometry();
    if (!geometry || !(geometry instanceof Polygon || geometry instanceof MultiPolygon)) return;

    const coords = this.getValidPolygonCoords(geometry);
    if (!coords) {
      alert('Нет корректных контуров');
      return;
    }

    let pol: any;
    if (geometry instanceof Polygon) {
      pol = turf.polygon(coords as Coordinate[][]);
    } else {
      pol = turf.multiPolygon(coords as Coordinate[][][]);
    }

    // Обрезка рядов по полигону
    const resultSegments: any[] = [];
    this.rowsPreview.forEach(line => {
      const split = turf.lineSplit(line, pol);

      // Берём сегменты, которые полностью лежат внутри полигона
      split.features.forEach(segment => {
        const segmentLength = turf.length(segment, {units: 'meters'});
        if (segmentLength > 0) {
          const center = turf.along(segment, segmentLength / 2, {units: 'meters'});
          if (turf.booleanPointInPolygon(center, pol)) {
            resultSegments.push(segment);
          }
        }
      });
    });

    // Удаление старых слоёв
    if (this.rowsPreviewLayer) {
      this.map()!.removeLayer(this.rowsPreviewLayer);
      this.rowsPreviewLayer = null;
    }
    if (this.bboxPreviewLayer) {
      this.map()!.removeLayer(this.bboxPreviewLayer);
      this.bboxPreviewLayer = null;
    }
    if (this.handleLayer) {
      this.map()!.removeLayer(this.handleLayer);
      this.handleLayer = null;
    }
    if (this.handleTranslate) {
      this.map()!.removeInteraction(this.handleTranslate);
      this.handleTranslate = null;
    }

    // Сброс переменных предпросмотра
    this.bboxPivot = null;
    this.originalBboxPolygon = null;
    this.originalLines = [];
    this.previewAngle = 0;
    this.rowsPreview = [];

    // Добавление финальных рядов на карту
    this.addRowsToMap(resultSegments);

    // Здесь можно отправить `resultSegments` на сервер, если это требуется
  }

  /**
   * Проверяет и замыкает ринг, если нужно. Возвращает null, если ринг некорректен.
   */
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

  /**
   * Преобразует координаты Polygon или MultiPolygon из OpenLayers в формат GeoJSON с замыканием рингов.
   */
  private getValidPolygonCoords(geometry: Polygon | MultiPolygon): Coordinate[][] | Coordinate[][][] | null {
    if (geometry instanceof Polygon) {
      const coords = geometry.getCoordinates()
        .map((ring: Coordinate[]) => ring.map((point: Coordinate) => toLonLat(point)))
        .map(ring => this.closeAndValidateRing(ring))
        .filter((ring): ring is Coordinate[] => !!ring && ring.length >= 4);
      return coords.length ? coords : null;
    } else if (geometry instanceof MultiPolygon) {
      const coords = geometry.getCoordinates()
        .map((polygon: Coordinate[][]) =>
          polygon
            .map((ring: Coordinate[]) => ring.map((point: Coordinate) => toLonLat(point)))
            .map(ring => this.closeAndValidateRing(ring))
            .filter((ring): ring is Coordinate[] => !!ring && ring.length >= 4)
        )
        .filter((poly: Coordinate[][]) => poly.length > 0);
      return coords.length ? coords : null;
    }
    return null;
  }

  /**
   * Вспомогательная функция для шага по долготе.
   */
  private getLonStep(lat: number, stepMeters: number): number {
    const latRad = lat * Math.PI / 180;
    const stepKm = stepMeters / 1000;
    return stepKm / (111.32 * Math.cos(latRad));
  }

  /**
   * Добавляет сгенерированные ряды на карту.
   */
  private addRowsToMap(lines: any[]): void {
    const s = new VectorSource();
    lines.forEach(l => {
      const g = l.geometry.coordinates.map((c: any) => fromLonLat(c));
      s.addFeature(new Feature({
        geometry: new LineString(g as number[][]),
      }))
    });
    const layer = new VectorLayer({
      source: s,
      style: new Style({
        stroke: new Stroke({
          color: 'red',
          width: 2,
        }),
      }),
      properties: {name: 'FinalRowsLayer'}
    });
    this.map()!.addLayer(layer);
  }

}

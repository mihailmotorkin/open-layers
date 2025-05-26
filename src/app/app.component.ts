import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  Component,
  AfterViewInit,
  ElementRef,
  viewChild,
  signal,
  computed,
  effect,
  inject, OnInit
} from '@angular/core';
import { Feature, Map, View } from 'ol';
import { Coordinate } from 'ol/coordinate';
import { FeatureLike } from 'ol/Feature';
import { GeoJSON } from 'ol/format';
import { Pixel } from 'ol/pixel';
import { fromLonLat, toLonLat } from 'ol/proj';
import { OSM } from 'ol/source';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Translate } from 'ol/interaction';
import { Geometry, LineString, MultiPolygon, Point, Polygon } from 'ol/geom';
import { Style, Stroke, Fill, Circle } from 'ol/style';
import * as turf from '@turf/turf';
import { LineString as GeoLineString, Feature as GeoFeature } from 'geojson';
import { WfsService } from './services/wfs.service';
import { GeoFeatureCollection } from './interfaces/feature.interface';
import Collection from 'ol/Collection';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  imports: [
    ReactiveFormsModule,
    FormsModule,
  ],
  styleUrl: './app.component.css',
})
export class AppComponent implements AfterViewInit, OnInit {
  wfsService = inject(WfsService);
  loading = signal(false);
  selectedFeature = signal<Feature | null>(null);


  rowsPreviewLayer: VectorLayer | null = null;
  bboxPreviewLayer: VectorLayer | null = null;
  handleLayer: VectorLayer | null = null;
  handleTranslate: Translate | null = null;

  bboxFeature: Feature | null = null;
  handleFeature: Feature | null = null;
  rowLineFeatures: Feature[] = [];
  rowsPreview: any[] = [];
  bboxPivot: [number, number] | null = null;
  originalBboxPolygon: any = null;
  originalLines: any[] = [];
  previewAngle: number = 0;

  test = viewChild<ElementRef<HTMLElement>>('map')
  private map!: Map;
  protected helpVectorSource = new VectorSource();
  protected lineVectorSource = new VectorSource();
  protected polygonVectorSource = new VectorSource();
  private generatedPointsVectorSource = new VectorSource();

  // Предпросмотр рядов и bbox
  private dragStartAngle: number | null = null;
  private dragStartPreviewAngle: number = 0;
  private rotateTimeout: any = null;

  generatePointsForm = new FormGroup({
    distance: new FormControl<number | null>(null),
    count: new FormControl<number | null>(null),
    paddingStart: new FormControl<number | null>(null),
    paddingEnd: new FormControl<number | null>(null),
    generateEndPoint: new FormControl<boolean>(false),
    startGenerate: new FormControl<'start' | 'end'>('start'),
  })

  generateRowsForm = new FormGroup({
    step: new FormControl<number>(10),
    angle: new FormControl<number>(0),
    scale: new FormControl<number>(1),
  });

  selectedGeometry = signal<Geometry | null>(null);
  isDrawMode = signal(false);
  selectedGeometryType = computed(() => {
    if (!this.selectedGeometry()) {
      return null;
    }

    return this.selectedGeometry()!.getType();
  })

  ngOnInit() {
    this.loading.set(true)
    this.wfsService.getMockFeature().subscribe(response => {
      this.loadMockFeaturesToMap(response);
      this.loading.set(false);
    });
  }

  ngAfterViewInit(): void {
    this.initMap();
    this.map.on('singleclick', (event) => this.selectFeature(event.pixel));
  }

  private loadMockFeaturesToMap(response: GeoFeatureCollection<'MultiPolygon' | 'Point' | 'LineString'>): void {
    const format = new GeoJSON();
    const features = format.readFeatures(response, {
      featureProjection: 'EPSG:3857',
    });

    const polygons = features.filter(f => {
      const type = f.getGeometry()?.getType();
      return type === 'Polygon' || type === 'MultiPolygon';
    });

    const lines = features.filter(f => f.getGeometry()?.getType() === 'LineString');

    this.polygonVectorSource.addFeatures(polygons);
    this.lineVectorSource.addFeatures(lines);

    if (features.length > 0) {
      this.zoomToFeature(features[0]);
    }
  }

  private zoomToFeature(feature: Feature): void {
    const geometry = feature.getGeometry();
    if (!geometry) return;

    this.map.getView().fit(geometry.getExtent(), {
      padding: [50, 50, 50, 50],
      maxZoom: 18,
      duration: 500,
    });
  }

  private selectFeature(pixel: Pixel) {
    this.selectedGeometry.set(null);
    this.selectedFeature.set(null);
    if (this.isDrawMode()) {
      return;
    }

    const featureLike = this.selectFeatureByPixel(pixel);

    if (!featureLike || !(featureLike instanceof Feature)) {
      return;
    }
    const geometry = featureLike.getGeometry();

    if (geometry instanceof Geometry) {
      this.selectedGeometry.set(geometry);
      this.selectedFeature.set(featureLike);

      // В зависимости от типа геометрии предлагаем действие
      if (geometry instanceof LineString) {
        // Для линии — генерация точек
        if (confirm('Сгенерировать точки на линии?')) {
          this.generatePointsOnLine();
        }
      } else if (geometry instanceof Polygon || geometry instanceof MultiPolygon) {
        // Только выбираем геометрию, никаких confirm и генерации!
        // Пользователь увидит форму и сам нажмёт "Предпросмотр" или "Сохранить"
      }
    }

  }

  private selectFeatureByPixel(pixel: Pixel): FeatureLike {
    return this.map.forEachFeatureAtPixel(pixel, feature => feature)!
  }

  constructor() {
    effect(() => {
      const selected = this.selectedGeometry();
      this.helpVectorSource.clear(true);
      if (selected instanceof LineString) {
        this.drawStartEndLinePoints(selected);
      }
    });
  }

  private initMap(): void {
    this.map = new Map({
      target: this.test()!.nativeElement,
      layers: [
        new TileLayer({
          source: new OSM()
        }),
        new VectorLayer({
          source: this.lineVectorSource,
          style: new Style({
            stroke: new Stroke({
              color: '#3399CC',
              width: 4,
            }),
          }),
          properties: {
            name: 'LinesVectorLayer',
          },
        }),
        new VectorLayer({
          source: this.polygonVectorSource,
          style: new Style({
            stroke: new Stroke({
              color: '#3399CC',
              width: 4,
            }),
          }),
          properties: {
            name: 'PolygonsVectorLayer',
          },
        }),
        new VectorLayer({
          source: this.helpVectorSource,
          style: (feature) => {
            const type = feature.get('type');

            switch (type) {
              case 'startLine':
                return new Style({
                  image: new Circle({
                    radius: 5,
                    fill: new Fill({color: '#21cc2e'}),
                  })
                });
              case 'endLine':
                return new Style({
                  image: new Circle({
                    radius: 5,
                    fill: new Fill({color: 'red'}),
                  })
                });
              default:
                return new Style();
            }
          },
          properties: {
            name: 'GenerateHelpLayer',
          }
        }),
        new VectorLayer({
          source: this.generatedPointsVectorSource,
          style: new Style({
            image: new Circle({
              radius: 3,
              fill: new Fill({color: 'yellow'}),
            }),
          }),
        })
      ],
      view: new View({
        center: fromLonLat([33.598321, 44.512136]),
        zoom: 15,
      })
    });
  }

  private drawStartEndLinePoints(line: LineString) {
    this.helpVectorSource.addFeature(new Feature({
      type: 'startLine',
      geometry: new Point(line.getCoordinates().at(0)!)
    }))
    this.helpVectorSource.addFeature(new Feature({
      type: 'endLine',
      geometry: new Point(line.getCoordinates().at(-1)!)
    }))
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

  sanitizeNumber(data: number): number | null {
    return isNaN(data) || data === 0 ? null : data;
  }

  generatePointsOnLine() {
    const geometry = this.selectedGeometry();
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

  generatePointsByDistance(start: any, end: any, intervalMeters: any) {
    if (!intervalMeters) {
      return;
    }

    // var intersection = turf.intersect(turf.featureCollection([poly1, poly2]));
    // console.log(intersection);
    const line = turf.lineString([start, end]);
    const spoints = [turf.point(start), turf.point(end)];
    console.log(turf.bearing(spoints[0], spoints[1]));
    const totalDistance = turf.length(line, {units: 'centimetres'});
    console.log('дистанция в сантиметрах', totalDistance);
    const points = [];
    let currentDistance = 1000;

    while (currentDistance <= totalDistance) {
      const point = turf.along(line, currentDistance, {units: 'centimetres'});
      points.push(point.geometry.coordinates);
      currentDistance += intervalMeters;
    }

    // if (!points.some(p => p[0] === end[0] && p[1] === end[1])) {
    //   points.push(end);
    // }

    return points;
  }


  previewRows(angleOverride?: number) {
    this.clearPreviewLayersAndInteractions();

    const { geometry, step, angle, scale, coords, pol } = this.preparePreviewGeometry(angleOverride);
    if (!geometry || !coords || !pol) return;

    const { bboxPolygon, bboxPivot, originalLines } = this.createBboxAndLines(pol, step ?? 10, scale ?? 1);
    this.bboxPivot = bboxPivot;
    this.originalBboxPolygon = bboxPolygon;
    this.originalLines = originalLines;

    const { rotatedBboxPolygon, rotatedLines } = this.rotateBboxAndLines(bboxPolygon, originalLines, angle, bboxPivot);
    this.rowsPreview = rotatedLines;

    this.createPreviewFeatures(rotatedBboxPolygon, rotatedLines);
    this.createPreviewLayers();
    this.addHandleTranslate();
  }

  // --- Вспомогательные методы ---

  private clearPreviewLayersAndInteractions() {
    if (this.rowsPreviewLayer) this.map.removeLayer(this.rowsPreviewLayer);
    if (this.bboxPreviewLayer) this.map.removeLayer(this.bboxPreviewLayer);
    if (this.handleLayer) this.map.removeLayer(this.handleLayer);
    if (this.handleTranslate) this.map.removeInteraction(this.handleTranslate);
  }

  private preparePreviewGeometry(angleOverride?: number) {
    const geometry = this.selectedGeometry();
    if (!geometry || !(geometry instanceof Polygon || geometry instanceof MultiPolygon)) return {};

    const { step, angle, scale } = this.generateRowsForm.getRawValue();
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

    return { geometry, step, angle: usedAngle, scale, coords, pol };
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
    return { bboxPolygon, bboxPivot, originalLines: lines };
  }

  private rotateBboxAndLines(bboxPolygon: any, lines: any[], angle: number, pivot: [number, number]) {
    const rotatedBboxPolygon = turf.transformRotate(bboxPolygon, angle, { pivot });
    const rotatedLines = lines.map(line => turf.transformRotate(line, angle, { pivot }));
    return { rotatedBboxPolygon, rotatedLines };
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
      source: new VectorSource({ features: this.bboxFeature ? [this.bboxFeature] : [] }),
      style: new Style({
        stroke: new Stroke({ color: 'orange', width: 2 }),
        fill: new Fill({ color: 'rgba(255,165,0,0.05)' }),
      }),
      properties: { name: 'BBoxPreviewLayer' }
    });
    this.map.addLayer(this.bboxPreviewLayer);

    this.handleLayer = new VectorLayer({
      source: new VectorSource({ features: this.handleFeature ? [this.handleFeature] : [] }),
      style: new Style({
        image: new Circle({
          radius: 7,
          fill: new Fill({ color: 'orange' }),
          stroke: new Stroke({ color: 'black', width: 2 })
        })
      }),
      properties: { name: 'HandleLayer' }
    });
    this.map.addLayer(this.handleLayer);

    this.rowsPreviewLayer = new VectorLayer({
      source: new VectorSource({ features: this.rowLineFeatures }),
      style: new Style({
        stroke: new Stroke({ color: 'blue', width: 2, lineDash: [8, 8] }),
      }),
      properties: { name: 'RowsPreviewLayer' }
    });
    this.map.addLayer(this.rowsPreviewLayer);
  }

  private addHandleTranslate() {
    this.handleTranslate = new Translate({ features: new Collection([this.handleFeature!].filter((f): f is Feature<Geometry> => !!f)) });
    this.map.addInteraction(this.handleTranslate);

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

        const rotatedBboxPolygon = turf.transformRotate(this.originalBboxPolygon, newAngle, { pivot: this.bboxPivot ?? undefined });
        const rotatedLines = this.originalLines.map(line => turf.transformRotate(line, newAngle, { pivot: this.bboxPivot ?? undefined }));
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
      this.map.removeLayer(this.rowsPreviewLayer);
      this.rowsPreviewLayer = null;
    }
    if (this.bboxPreviewLayer) {
      this.map.removeLayer(this.bboxPreviewLayer);
      this.bboxPreviewLayer = null;
    }
    if (this.handleLayer) {
      this.map.removeLayer(this.handleLayer);
      this.handleLayer = null;
    }
    if (this.handleTranslate) {
      this.map.removeInteraction(this.handleTranslate);
      this.handleTranslate = null;
    }

    // Удаляем все финальные (красные) ряды
    this.map.getLayers().getArray()
      .filter(l => l instanceof VectorLayer && l.get('name') === 'FinalRowsLayer')
      .forEach(l => this.map.removeLayer(l));

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
      this.map.removeLayer(this.rowsPreviewLayer);
      this.rowsPreviewLayer = null;
    }
    // Генерируем новые ряды для выбранной геометрии
    this.previewRows();
  }

  // Кнопка "Сохранить"
  saveRows() {
    const geometry = this.selectedGeometry();
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
        const segmentLength = turf.length(segment, { units: 'meters' });
        if (segmentLength > 0) {
          const center = turf.along(segment, segmentLength / 2, { units: 'meters' });
          if (turf.booleanPointInPolygon(center, pol)) {
            resultSegments.push(segment);
          }
        }
      });
    });

    // Удаление старых слоёв
    if (this.rowsPreviewLayer) {
      this.map.removeLayer(this.rowsPreviewLayer);
      this.rowsPreviewLayer = null;
    }
    if (this.bboxPreviewLayer) {
      this.map.removeLayer(this.bboxPreviewLayer);
      this.bboxPreviewLayer = null;
    }
    if (this.handleLayer) {
      this.map.removeLayer(this.handleLayer);
      this.handleLayer = null;
    }
    if (this.handleTranslate) {
      this.map.removeInteraction(this.handleTranslate);
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
      properties: { name: 'FinalRowsLayer' }
    });
    this.map.addLayer(layer);
  }
}

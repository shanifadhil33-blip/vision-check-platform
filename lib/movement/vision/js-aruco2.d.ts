/**
 * Hand-written types for js-aruco2 2.0.0 (CommonJS, no bundled types).
 * Only the parts movement detection uses. Corner coordinates are integer pixel
 * indices of the image passed to detect().
 */
declare module "js-aruco2" {
  type ArucoCorner = { x: number; y: number };

  type ArucoMarker = {
    id: number;
    corners: ArucoCorner[];
    hammingDistance: number;
  };

  type ArucoImage = {
    width: number;
    height: number;
    data: Uint8ClampedArray | Uint8Array;
  };

  type ArucoModule = {
    AR: {
      Detector: new (config?: { dictionaryName?: string; maxHammingDistance?: number }) => {
        detect(image: ArucoImage): ArucoMarker[];
      };
      Dictionary: new (dictionaryName: string) => {
        codeList: string[];
        markSize: number;
      };
    };
  };

  const jsAruco: ArucoModule;
  export default jsAruco;
}

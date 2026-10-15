


export const BRICK_STYLE = Object.freeze({
  blockWidth: 1.6,
  blockHeight: 0.8,
  jointWidth: 0.026,
  bevelWidth: 0.045,
  reliefHeight: 0.018,
  studPitch: 0.8,
  studRadius: 0.23,
  studHeight: 0.13,
  roughness: 0.3,
  clearcoat: 0.28,
});

export function createBrickPlasticMaterial(THREE) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: BRICK_STYLE.roughness,
    metalness: 0,
    clearcoat: BRICK_STYLE.clearcoat,
    clearcoatRoughness: 0.22,
  });
  material.name = "Procedural toy-brick plastic · metric seams";
  material.userData.brickStyle = { ...BRICK_STYLE };
  material.customProgramCacheKey = () => "urban-route-metric-brick-plastic-v1";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.urBrickSize = {
      value: new THREE.Vector2(BRICK_STYLE.blockWidth, BRICK_STYLE.blockHeight),
    };
    shader.uniforms.urJoint = { value: BRICK_STYLE.jointWidth };
    shader.uniforms.urBevel = { value: BRICK_STYLE.bevelWidth };
    shader.uniforms.urRelief = { value: BRICK_STYLE.reliefHeight };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 urBrickPosition;
        varying vec3 urBrickNormal;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 urP = vec4(position, 1.0);
        vec3 urN = normal;
        #ifdef USE_INSTANCING
          urP = instanceMatrix * urP;
          mat3 urIM = mat3(instanceMatrix);
          urN /= vec3(dot(urIM[0],urIM[0]),dot(urIM[1],urIM[1]),dot(urIM[2],urIM[2]));
          urN = urIM * urN;
        #endif
        urBrickPosition = urP.xyz;
        urBrickNormal = normalize(urN);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 urBrickPosition;
        varying vec3 urBrickNormal;
        uniform vec2 urBrickSize;
        uniform float urJoint;
        uniform float urBevel;
        uniform float urRelief;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 urAbsN = abs(normalize(urBrickNormal));
        vec2 urSurface = urAbsN.y > 0.5 ? urBrickPosition.xz :
          (urAbsN.x > urAbsN.z ? urBrickPosition.zy : urBrickPosition.xy);
        vec2 urGrid = urSurface / urBrickSize;
        float urRow = floor(urGrid.y);
        urGrid.x += mod(urRow, 2.0) * 0.5;
        vec2 urCell = fract(urGrid);
        vec2 urEdgeXY = min(urCell, 1.0-urCell) * urBrickSize;
        float urEdge = min(urEdgeXY.x, urEdgeXY.y);
        float urAA = max(fwidth(urEdge), 0.001);
        float urSeam = 1.0-smoothstep(urJoint*0.5,urJoint*0.5+urAA,urEdge);
        float urBevelProfile = smoothstep(urJoint*0.5,urJoint*0.5+urBevel,urEdge);
        float urBrickRelief = urRelief * urBevelProfile;
        vec2 urCellID = floor(urGrid);
        float urTint = 0.985+0.03*fract(sin(dot(urCellID,vec2(12.9898,78.233)))*43758.5453);
        diffuseColor.rgb *= urTint * mix(0.76,1.0,urBevelProfile) * mix(1.0,0.66,urSeam);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        // Screen-space bump from the same analytic bevel, preserving the PBR pipeline.
        vec3 urDx = dFdx(-vViewPosition);
        vec3 urDy = dFdy(-vViewPosition);
        vec3 urR1 = cross(urDy, normal);
        vec3 urR2 = cross(normal, urDx);
        float urDet = dot(urDx, urR1);
        vec3 urGradient = sign(urDet) * (dFdx(urBrickRelief)*urR1+dFdy(urBrickRelief)*urR2);
        if(abs(urDet)>1e-10) normal = normalize(abs(urDet)*normal-urGradient);`,
      )
      .replace(
        "#include <clearcoat_normal_fragment_begin>",
        `#include <clearcoat_normal_fragment_begin>
        #ifdef USE_CLEARCOAT
          clearcoatNormal = normal;
        #endif`,
      );
  };
  return material;
}

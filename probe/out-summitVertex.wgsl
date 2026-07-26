// Three.js r185 - Node System

// directives


// structs


// uniforms

struct renderStruct {
	cameraProjectionMatrix : mat4x4<f32>,
	cameraViewMatrix : mat4x4<f32>
};
@binding( 0 ) @group( 0 )
var<uniform> render : renderStruct;

struct objectStruct {
	nodeUniform0 : f32,
	nodeUniform1 : f32,
	nodeUniform4 : mat4x4<f32>,
	nodeUniform5 : f32,
	nodeUniform6 : vec2<f32>,
	nodeUniform7 : f32,
	nodeUniform8 : f32
};
@binding( 0 ) @group( 1 )
var<uniform> object : objectStruct;

// varyings

struct VaryingsStruct {
	@builtin( position ) builtinClipSpace : vec4<f32>
};
var<private> varyings : VaryingsStruct;

// vars
var<private> modelViewMatrix : mat4x4<f32>;
var<private> nodeVar1 : vec4<f32>;
var<private> nodeVar2 : f32;
var<private> nodeVar3 : f32;
var<private> VERTEX_nodeVar4 : vec4<f32>;
var<private> positionLocal : vec3<f32>;
var<private> v_modelViewProjection : vec4<f32>;
var<private> v_positionView : vec4<f32>;
var<private> VERTEX_v_modelViewProjection : vec4<f32>;

// codes


@vertex
fn main( @location( 0 ) position : vec3<f32> ) -> VaryingsStruct {

	// flow
	// code

	positionLocal = position;
	positionLocal = vec3<f32>( -0.02544031311154671, 8.095797339710058, 0.025440313111545265 );
	modelViewMatrix = ( render.cameraViewMatrix * object.nodeUniform4 );
	nodeVar1 = ( modelViewMatrix * vec4<f32>( vec3<f32>( -0.02544031311154671, 8.095797339710058, 0.025440313111545265 ), 1.0 ) );
	nodeVar2 = cos( object.nodeUniform5 );
	nodeVar3 = sin( object.nodeUniform5 );
	v_positionView = vec4<f32>( ( nodeVar1.xy + ( mat2x2<f32>( nodeVar2, nodeVar3, ( - nodeVar3 ), nodeVar2 ) * ( ( position.xy - ( object.nodeUniform6 - vec2<f32>( 0.5 ) ) ) * ( vec2<f32>( length( object.nodeUniform4[ 0u ].xyz ), length( object.nodeUniform4[ 1u ].xyz ) ) * vec2<f32>( ( ( 0.42 * ( ( smoothstep( 0.96, 1.0, object.nodeUniform7 ) * 0.65 ) + 0.35 ) ) * ( ( ( ( sin( ( object.nodeUniform8 * 2.2 ) ) * 0.5 ) + 0.5 ) * 0.35 ) + 0.75 ) ) ) ) ) ) ), nodeVar1.zw );
	VERTEX_nodeVar4 = ( render.cameraProjectionMatrix * v_positionView );
	VERTEX_v_modelViewProjection = VERTEX_nodeVar4;

	// result

	varyings.builtinClipSpace = VERTEX_v_modelViewProjection;

	return varyings;

}

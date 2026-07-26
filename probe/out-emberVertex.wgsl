// Three.js r185 - Node System

// directives


// structs


// uniforms

struct NodeBuffer_991Struct {
	value : array< f32 >
};
@binding( 2 ) @group( 1 )
var<storage, read> NodeBuffer_991 : NodeBuffer_991Struct;

struct NodeBuffer_968Struct {
	value : array< u32 >
};
@binding( 3 ) @group( 1 )
var<storage, read> NodeBuffer_968 : NodeBuffer_968Struct;

struct NodeBuffer_992Struct {
	value : array< f32 >
};
@binding( 4 ) @group( 1 )
var<storage, read> NodeBuffer_992 : NodeBuffer_992Struct;

struct NodeBuffer_993Struct {
	value : array< f32 >
};
@binding( 5 ) @group( 1 )
var<storage, read> NodeBuffer_993 : NodeBuffer_993Struct;

struct objectStruct {
	nodeUniform1 : u32,
	nodeUniform2 : u32,
	nodeUniform4 : u32,
	nodeUniform5 : u32,
	nodeUniform6 : u32,
	nodeUniform7 : u32,
	nodeUniform10 : f32,
	nodeUniform12 : u32,
	nodeUniform13 : u32,
	nodeUniform14 : u32,
	nodeUniform15 : u32,
	nodeUniform16 : u32,
	nodeUniform17 : f32,
	nodeUniform18 : f32,
	nodeUniform21 : mat4x4<f32>,
	nodeUniform22 : f32,
	nodeUniform23 : vec2<f32>
};
@binding( 1 ) @group( 1 )
var<uniform> object : objectStruct;

struct renderStruct {
	cameraProjectionMatrix : mat4x4<f32>,
	cameraViewMatrix : mat4x4<f32>
};
@binding( 0 ) @group( 0 )
var<uniform> render : renderStruct;

// varyings

struct VaryingsStruct {
	@location( 0 ) @interpolate(flat, either) nodeVarying4 : u32,
	@builtin( position ) builtinClipSpace : vec4<f32>
};
var<private> varyings : VaryingsStruct;

// vars
var<private> nodeVar0 : u32;
var<private> nodeVar1 : u32;
var<private> nodeVar2 : u32;
var<private> nodeVar3 : u32;
var<private> nodeVar4 : f32;
var<private> nodeVar5 : u32;
var<private> nodeVar6 : f32;
var<private> nodeVar7 : f32;
var<private> nodeVar8 : u32;
var<private> nodeVar9 : vec3<f32>;
var<private> nodeVar10 : u32;
var<private> nodeVar11 : vec3<f32>;
var<private> nodeVar12 : f32;
var<private> nodeVar13 : vec3<f32>;
var<private> nodeVar14 : u32;
var<private> nodeVar15 : u32;
var<private> nodeVar16 : u32;
var<private> nodeVar17 : u32;
var<private> nodeVar18 : u32;
var<private> nodeVar19 : u32;
var<private> nodeVar20 : f32;
var<private> nodeVar21 : f32;
var<private> nodeVar22 : vec3<f32>;
var<private> modelViewMatrix : mat4x4<f32>;
var<private> nodeVar31 : vec4<f32>;
var<private> nodeVar32 : f32;
var<private> nodeVar33 : f32;
var<private> nodeVar34 : f32;
var<private> VERTEX_nodeVar35 : vec4<f32>;
var<private> positionLocal : vec3<f32>;
var<private> v_modelViewProjection : vec4<f32>;
var<private> v_positionView : vec4<f32>;
var<private> VERTEX_v_modelViewProjection : vec4<f32>;

// codes


@vertex
fn main( @builtin( instance_index ) instanceIndex : u32,
	@location( 0 ) position : vec3<f32> ) -> VaryingsStruct {

	// flow
	// code

	positionLocal = position;
	nodeVar0 = ( instanceIndex * object.nodeUniform1 );
	nodeVar1 = ( nodeVar0 * 64u );
	nodeVar2 = ( ( ( nodeVar1 + 777u ) * 747796405u ) + 2891336453u );
	nodeVar3 = ( ( ( nodeVar2 >> ( ( nodeVar2 >> 28u ) + 4u ) ) ^ nodeVar2 ) * 277803737u );
	nodeVar5 = ( ( ( ( ( ( NodeBuffer_968.value[ nodeVar0 ] - 1u ) / object.nodeUniform4 ) + 1u ) + ( object.nodeUniform5 - 1u ) ) / object.nodeUniform5 ) * object.nodeUniform5 );

	if ( ( nodeVar5 > ( ( object.nodeUniform6 - 2u ) * object.nodeUniform5 ) ) ) {

		nodeVar4 = ( f32( object.nodeUniform7 ) - 1.0 );

	} else {

		nodeVar4 = f32( nodeVar5 );

	}

	nodeVar6 = clamp( ( nodeVar4 / ( f32( object.nodeUniform7 ) - 1.0 ) ), 0.0, 1.0 );
	nodeVar7 = ( nodeVar6 * 31.0 );
	nodeVar8 = ( ( ( u32( min( ( ( f32( ( ( nodeVar3 >> 22u ) ^ nodeVar3 ) ) * 2.3283064365386963e-10 ) * f32( object.nodeUniform2 ) ), ( f32( object.nodeUniform2 ) - 1.0 ) ) ) * 32u ) + u32( min( nodeVar7, 30.0 ) ) ) * 3u );
	nodeVar9 = vec3<f32>( NodeBuffer_991.value[ nodeVar8 ], NodeBuffer_991.value[ ( nodeVar8 + 1u ) ], NodeBuffer_991.value[ ( nodeVar8 + 2u ) ] );
	nodeVar10 = ( nodeVar8 + 3u );
	nodeVar11 = vec3<f32>( NodeBuffer_991.value[ nodeVar10 ], NodeBuffer_991.value[ ( nodeVar10 + 1u ) ], NodeBuffer_991.value[ ( nodeVar10 + 2u ) ] );
	nodeVar12 = ( nodeVar7 - f32( u32( min( nodeVar7, 30.0 ) ) ) );
	nodeVar13 = mix( vec3<f32>( NodeBuffer_992.value[ nodeVar8 ], NodeBuffer_992.value[ ( nodeVar8 + 1u ) ], NodeBuffer_992.value[ ( nodeVar8 + 2u ) ] ), vec3<f32>( NodeBuffer_992.value[ nodeVar10 ], NodeBuffer_992.value[ ( nodeVar10 + 1u ) ], NodeBuffer_992.value[ ( nodeVar10 + 2u ) ] ), nodeVar12 );
	nodeVar14 = ( ( ( nodeVar1 + 888u ) * 747796405u ) + 2891336453u );
	nodeVar15 = ( ( ( nodeVar14 >> ( ( nodeVar14 >> 28u ) + 4u ) ) ^ nodeVar14 ) * 277803737u );
	nodeVar16 = ( ( ( nodeVar1 + 999u ) * 747796405u ) + 2891336453u );
	nodeVar17 = ( ( ( nodeVar16 >> ( ( nodeVar16 >> 28u ) + 4u ) ) ^ nodeVar16 ) * 277803737u );
	nodeVar18 = ( ( ( nodeVar1 + 505u ) * 747796405u ) + 2891336453u );
	nodeVar19 = ( ( ( nodeVar18 >> ( ( nodeVar18 >> 28u ) + 4u ) ) ^ nodeVar18 ) * 277803737u );
	nodeVar20 = ( ( nodeVar6 * 0.96 ) + ( ( f32( ( ( nodeVar19 >> 22u ) ^ nodeVar19 ) ) * 2.3283064365386963e-10 ) * 0.04 ) );
	nodeVar21 = smoothstep( nodeVar20, ( nodeVar20 + 0.2 ), object.nodeUniform10 );
	nodeVar22 = ( ( ( mix( nodeVar9, nodeVar11, nodeVar12 ) + ( nodeVar13 * vec3<f32>( 0.15 ) ) ) + ( normalize( cross( ( nodeVar11 - nodeVar9 ), nodeVar13 ) ) * vec3<f32>( ( ( ( ( f32( ( ( nodeVar15 >> 22u ) ^ nodeVar15 ) ) * 2.3283064365386963e-10 ) - 0.5 ) * 3.5 ) + ( sin( ( ( nodeVar6 * 12.566370614359172 ) + ( ( f32( ( ( nodeVar17 >> 22u ) ^ nodeVar17 ) ) * 2.3283064365386963e-10 ) * 6.283185307179586 ) ) ) * 0.5 ) ) ) ) ) + ( mix( vec3<f32>( NodeBuffer_993.value[ nodeVar8 ], NodeBuffer_993.value[ ( nodeVar8 + 1u ) ], NodeBuffer_993.value[ ( nodeVar8 + 2u ) ] ), vec3<f32>( NodeBuffer_993.value[ nodeVar10 ], NodeBuffer_993.value[ ( nodeVar10 + 1u ) ], NodeBuffer_993.value[ ( nodeVar10 + 2u ) ] ), nodeVar12 ) * vec3<f32>( ( pow( nodeVar21, 1.4 ) * 2.4 ) ) ) );
	positionLocal = nodeVar22;
	varyings.nodeVarying4 = instanceIndex;
	modelViewMatrix = ( render.cameraViewMatrix * object.nodeUniform21 );
	nodeVar31 = ( modelViewMatrix * vec4<f32>( nodeVar22, 1.0 ) );
	nodeVar32 = cos( object.nodeUniform22 );
	nodeVar33 = sin( object.nodeUniform22 );

	if ( ( NodeBuffer_968.value[ nodeVar0 ] > 0u ) ) {

		nodeVar34 = 1.0;

	} else {

		nodeVar34 = 0.0;

	}

	v_positionView = vec4<f32>( ( nodeVar31.xy + ( mat2x2<f32>( nodeVar32, nodeVar33, ( - nodeVar33 ), nodeVar32 ) * ( ( position.xy - ( object.nodeUniform23 - vec2<f32>( 0.5 ) ) ) * ( vec2<f32>( length( object.nodeUniform21[ 0u ].xyz ), length( object.nodeUniform21[ 1u ].xyz ) ) * ( ( ( vec2<f32>( 0.09, 0.09 ) * vec2<f32>( smoothstep( nodeVar20, ( nodeVar20 + 0.02 ), object.nodeUniform10 ) ) ) * vec2<f32>( ( 1.0 - ( nodeVar21 * 0.35 ) ) ) ) * vec2<f32>( nodeVar34 ) ) ) ) ) ), nodeVar31.zw );
	VERTEX_nodeVar35 = ( render.cameraProjectionMatrix * v_positionView );
	VERTEX_v_modelViewProjection = VERTEX_nodeVar35;

	// result

	varyings.builtinClipSpace = VERTEX_v_modelViewProjection;

	return varyings;

}

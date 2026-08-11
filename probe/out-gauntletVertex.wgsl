// Three.js r185 - Node System

// directives


// structs


// uniforms

struct NodeBuffer_991Struct {
	value : array< f32 >
};
@binding( 1 ) @group( 1 )
var<storage, read> NodeBuffer_991 : NodeBuffer_991Struct;

struct NodeBuffer_997Struct {
	value : array< u32 >
};
@binding( 2 ) @group( 1 )
var<storage, read> NodeBuffer_997 : NodeBuffer_997Struct;

struct NodeBuffer_995Struct {
	value : array< u32 >
};
@binding( 3 ) @group( 1 )
var<storage, read> NodeBuffer_995 : NodeBuffer_995Struct;

struct NodeBuffer_992Struct {
	value : array< f32 >
};
@binding( 4 ) @group( 1 )
var<storage, read> NodeBuffer_992 : NodeBuffer_992Struct;

struct NodeBuffer_994Struct {
	value : array< f32 >
};
@binding( 5 ) @group( 1 )
var<storage, read> NodeBuffer_994 : NodeBuffer_994Struct;

struct NodeBuffer_993Struct {
	value : array< f32 >
};
@binding( 6 ) @group( 1 )
var<storage, read> NodeBuffer_993 : NodeBuffer_993Struct;

struct objectStruct {
	nodeUniform2 : u32,
	nodeUniform7 : f32,
	nodeUniform8 : f32,
	nodeUniform11 : mat4x4<f32>
};
@binding( 0 ) @group( 1 )
var<uniform> object : objectStruct;

struct renderStruct {
	cameraProjectionMatrix : mat4x4<f32>,
	cameraViewMatrix : mat4x4<f32>
};
@binding( 0 ) @group( 0 )
var<uniform> render : renderStruct;

// varyings

struct VaryingsStruct {
	@location( 0 ) nodeVarying3 : vec4<f32>,
	@builtin( position ) builtinClipSpace : vec4<f32>
};
var<private> varyings : VaryingsStruct;

// vars
var<private> nodeVar0 : u32;
var<private> nodeVar1 : u32;
var<private> nodeVar2 : u32;
var<private> nodeVar3 : f32;
var<private> nodeVar4 : u32;
var<private> nodeVar5 : f32;
var<private> nodeVar6 : f32;
var<private> nodeVar7 : u32;
var<private> nodeVar8 : u32;
var<private> nodeVar9 : f32;
var<private> nodeVar10 : u32;
var<private> nodeVar11 : vec3<f32>;
var<private> nodeVar12 : vec3<f32>;
var<private> nodeVar13 : vec3<f32>;
var<private> nodeVar14 : vec3<f32>;
var<private> nodeVar15 : vec3<f32>;
var<private> nodeVar16 : f32;
var<private> modelViewMatrix : mat4x4<f32>;
var<private> VERTEX_nodeVar18 : vec4<f32>;
var<private> positionLocal : vec3<f32>;
var<private> v_modelViewProjection : vec4<f32>;
var<private> v_positionView : vec3<f32>;
var<private> VERTEX_v_modelViewProjection : vec4<f32>;

// codes


@vertex
fn main( @builtin( vertex_index ) vertexIndex : u32,
	@location( 0 ) position : vec3<f32> ) -> VaryingsStruct {

	// flow
	// code

	positionLocal = position;
	nodeVar0 = ( vertexIndex / 2u );
	nodeVar1 = ( object.nodeUniform2 - 1u );
	nodeVar2 = ( nodeVar0 / nodeVar1 );
	nodeVar4 = ( ( nodeVar0 - ( nodeVar2 * nodeVar1 ) ) + ( vertexIndex - ( nodeVar0 * 2u ) ) );

	if ( ( nodeVar4 > NodeBuffer_995.value[ nodeVar2 ] ) ) {

		nodeVar3 = f32( NodeBuffer_995.value[ nodeVar2 ] );

	} else {

		nodeVar3 = f32( nodeVar4 );

	}

	nodeVar5 = clamp( ( nodeVar3 / ( f32( object.nodeUniform2 ) - 1.0 ) ), 0.0, 1.0 );
	nodeVar6 = ( nodeVar5 * 31.0 );
	nodeVar7 = ( ( ( NodeBuffer_997.value[ nodeVar2 ] * 32u ) + u32( min( nodeVar6, 30.0 ) ) ) * 3u );
	nodeVar8 = ( nodeVar7 + 3u );
	nodeVar9 = ( nodeVar6 - f32( u32( min( nodeVar6, 30.0 ) ) ) );

	if ( ( nodeVar4 > NodeBuffer_995.value[ nodeVar2 ] ) ) {

		nodeVar10 = NodeBuffer_995.value[ nodeVar2 ];

	} else {

		nodeVar10 = nodeVar4;

	}

	positionLocal = ( mix( vec3<f32>( NodeBuffer_991.value[ nodeVar7 ], NodeBuffer_991.value[ ( nodeVar7 + 1u ) ], NodeBuffer_991.value[ ( nodeVar7 + 2u ) ] ), vec3<f32>( NodeBuffer_991.value[ nodeVar8 ], NodeBuffer_991.value[ ( nodeVar8 + 1u ) ], NodeBuffer_991.value[ ( nodeVar8 + 2u ) ] ), nodeVar9 ) + ( mix( vec3<f32>( NodeBuffer_992.value[ nodeVar7 ], NodeBuffer_992.value[ ( nodeVar7 + 1u ) ], NodeBuffer_992.value[ ( nodeVar7 + 2u ) ] ), vec3<f32>( NodeBuffer_992.value[ nodeVar8 ], NodeBuffer_992.value[ ( nodeVar8 + 1u ) ], NodeBuffer_992.value[ ( nodeVar8 + 2u ) ] ), nodeVar9 ) * vec3<f32>( ( 0.23 + clamp( ( ( ( log( max( NodeBuffer_994.value[ ( ( nodeVar2 * 32u ) + nodeVar10 ) ], 1.0 ) ) * 0.43429448190325176 ) - NodeBuffer_993.value[ nodeVar10 ] ) * 0.24 ), -0.04, 0.3 ) ) ) ) );

	if ( ( nodeVar2 == 1u ) ) {

		nodeVar11 = vec3<f32>( 0.204, 0.839, 0.694 );

	} else {


		if ( ( nodeVar2 == 2u ) ) {

			nodeVar12 = vec3<f32>( 0.965, 0.784, 0.373 );

		} else {


			if ( ( nodeVar2 == 3u ) ) {

				nodeVar13 = vec3<f32>( 1.0, 0.541, 0.298 );

			} else {


				if ( ( nodeVar2 == 4u ) ) {

					nodeVar14 = vec3<f32>( 0.749, 0.655, 1.0 );

				} else {


					if ( ( nodeVar2 == 5u ) ) {

						nodeVar15 = vec3<f32>( 1.0, 0.42, 0.545 );

					} else {

						nodeVar15 = vec3<f32>( 0.392, 0.71, 1.0 );

					}

					nodeVar14 = nodeVar15;

				}

				nodeVar13 = nodeVar14;

			}

			nodeVar12 = nodeVar13;

		}

		nodeVar11 = nodeVar12;

	}

	nodeVar16 = ( ( nodeVar5 * 0.97 ) + ( f32( nodeVar2 ) * 0.004 ) );
	varyings.nodeVarying3 = vec4<f32>( nodeVar11, ( 0.1 * smoothstep( nodeVar16, ( nodeVar16 + 0.025 ), object.nodeUniform7 ) ) );
	modelViewMatrix = ( render.cameraViewMatrix * object.nodeUniform11 );
	v_positionView = ( modelViewMatrix * vec4<f32>( positionLocal, 1.0 ) ).xyz;
	VERTEX_nodeVar18 = ( render.cameraProjectionMatrix * vec4<f32>( v_positionView, 1.0 ) );
	VERTEX_v_modelViewProjection = VERTEX_nodeVar18;

	// result

	varyings.builtinClipSpace = VERTEX_v_modelViewProjection;

	return varyings;

}

// Three.js r185 - Node System

// directives


// structs


// uniforms

struct NodeBuffer_991Struct {
	value : array< f32 >
};
@binding( 1 ) @group( 1 )
var<storage, read> NodeBuffer_991 : NodeBuffer_991Struct;

struct NodeBuffer_998Struct {
	value : array< u32 >
};
@binding( 2 ) @group( 1 )
var<storage, read> NodeBuffer_998 : NodeBuffer_998Struct;

struct NodeBuffer_996Struct {
	value : array< u32 >
};
@binding( 3 ) @group( 1 )
var<storage, read> NodeBuffer_996 : NodeBuffer_996Struct;

struct NodeBuffer_992Struct {
	value : array< f32 >
};
@binding( 4 ) @group( 1 )
var<storage, read> NodeBuffer_992 : NodeBuffer_992Struct;

struct NodeBuffer_995Struct {
	value : array< f32 >
};
@binding( 5 ) @group( 1 )
var<storage, read> NodeBuffer_995 : NodeBuffer_995Struct;

struct NodeBuffer_994Struct {
	value : array< f32 >
};
@binding( 6 ) @group( 1 )
var<storage, read> NodeBuffer_994 : NodeBuffer_994Struct;

struct NodeBuffer_997Struct {
	value : array< u32 >
};
@binding( 7 ) @group( 1 )
var<storage, read> NodeBuffer_997 : NodeBuffer_997Struct;

struct objectStruct {
	nodeUniform2 : u32,
	nodeUniform8 : f32,
	nodeUniform9 : f32,
	nodeUniform12 : mat4x4<f32>
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
var<private> nodeVar5 : u32;
var<private> nodeVar6 : f32;
var<private> nodeVar7 : f32;
var<private> nodeVar8 : u32;
var<private> nodeVar9 : u32;
var<private> nodeVar10 : f32;
var<private> nodeVar11 : u32;
var<private> nodeVar12 : vec3<f32>;
var<private> nodeVar13 : vec3<f32>;
var<private> nodeVar14 : vec3<f32>;
var<private> nodeVar15 : vec3<f32>;
var<private> nodeVar16 : vec3<f32>;
var<private> nodeVar17 : vec3<f32>;
var<private> nodeVar18 : f32;
var<private> nodeVar19 : f32;
var<private> modelViewMatrix : mat4x4<f32>;
var<private> VERTEX_nodeVar21 : vec4<f32>;
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
	nodeVar4 = ( nodeVar0 - ( nodeVar2 * nodeVar1 ) );
	nodeVar5 = ( nodeVar4 + ( vertexIndex - ( nodeVar0 * 2u ) ) );

	if ( ( nodeVar5 > NodeBuffer_996.value[ nodeVar2 ] ) ) {

		nodeVar3 = f32( NodeBuffer_996.value[ nodeVar2 ] );

	} else {

		nodeVar3 = f32( nodeVar5 );

	}

	nodeVar6 = clamp( ( nodeVar3 / ( f32( object.nodeUniform2 ) - 1.0 ) ), 0.0, 1.0 );
	nodeVar7 = ( nodeVar6 * 31.0 );
	nodeVar8 = ( ( ( NodeBuffer_998.value[ nodeVar2 ] * 32u ) + u32( min( nodeVar7, 30.0 ) ) ) * 3u );
	nodeVar9 = ( nodeVar8 + 3u );
	nodeVar10 = ( nodeVar7 - f32( u32( min( nodeVar7, 30.0 ) ) ) );

	if ( ( nodeVar5 > NodeBuffer_996.value[ nodeVar2 ] ) ) {

		nodeVar11 = NodeBuffer_996.value[ nodeVar2 ];

	} else {

		nodeVar11 = nodeVar5;

	}

	positionLocal = ( mix( vec3<f32>( NodeBuffer_991.value[ nodeVar8 ], NodeBuffer_991.value[ ( nodeVar8 + 1u ) ], NodeBuffer_991.value[ ( nodeVar8 + 2u ) ] ), vec3<f32>( NodeBuffer_991.value[ nodeVar9 ], NodeBuffer_991.value[ ( nodeVar9 + 1u ) ], NodeBuffer_991.value[ ( nodeVar9 + 2u ) ] ), nodeVar10 ) + ( mix( vec3<f32>( NodeBuffer_992.value[ nodeVar8 ], NodeBuffer_992.value[ ( nodeVar8 + 1u ) ], NodeBuffer_992.value[ ( nodeVar8 + 2u ) ] ), vec3<f32>( NodeBuffer_992.value[ nodeVar9 ], NodeBuffer_992.value[ ( nodeVar9 + 1u ) ], NodeBuffer_992.value[ ( nodeVar9 + 2u ) ] ), nodeVar10 ) * vec3<f32>( ( 0.23 + clamp( ( ( ( log( max( NodeBuffer_995.value[ ( ( nodeVar2 * 32u ) + nodeVar11 ) ], 1.0 ) ) * 0.43429448190325176 ) - NodeBuffer_994.value[ nodeVar11 ] ) * 1.0 ), -0.06, 1.4 ) ) ) ) );

	if ( ( ( NodeBuffer_997.value[ nodeVar2 ] == 1u ) && ( nodeVar11 == NodeBuffer_996.value[ nodeVar2 ] ) ) ) {

		nodeVar12 = vec3<f32>( 0.984, 0.173, 0.212 );

	} else {


		if ( ( nodeVar2 == 1u ) ) {

			nodeVar13 = vec3<f32>( 0.204, 0.839, 0.694 );

		} else {


			if ( ( nodeVar2 == 2u ) ) {

				nodeVar14 = vec3<f32>( 0.965, 0.784, 0.373 );

			} else {


				if ( ( nodeVar2 == 3u ) ) {

					nodeVar15 = vec3<f32>( 1.0, 0.541, 0.298 );

				} else {


					if ( ( nodeVar2 == 4u ) ) {

						nodeVar16 = vec3<f32>( 0.749, 0.655, 1.0 );

					} else {


						if ( ( nodeVar2 == 5u ) ) {

							nodeVar17 = vec3<f32>( 1.0, 0.42, 0.545 );

						} else {

							nodeVar17 = vec3<f32>( 0.392, 0.71, 1.0 );

						}

						nodeVar16 = nodeVar17;

					}

					nodeVar15 = nodeVar16;

				}

				nodeVar14 = nodeVar15;

			}

			nodeVar13 = nodeVar14;

		}

		nodeVar12 = nodeVar13;

	}

	nodeVar18 = ( ( nodeVar6 * 0.97 ) + ( f32( nodeVar2 ) * 0.004 ) );

	if ( ( nodeVar4 > 0u ) ) {

		nodeVar19 = 1.0;

	} else {

		nodeVar19 = 0.0;

	}

	varyings.nodeVarying3 = vec4<f32>( nodeVar12, ( ( 0.82 * smoothstep( nodeVar18, ( nodeVar18 + 0.025 ), object.nodeUniform8 ) ) * nodeVar19 ) );
	modelViewMatrix = ( render.cameraViewMatrix * object.nodeUniform12 );
	v_positionView = ( modelViewMatrix * vec4<f32>( positionLocal, 1.0 ) ).xyz;
	VERTEX_nodeVar21 = ( render.cameraProjectionMatrix * vec4<f32>( v_positionView, 1.0 ) );
	VERTEX_v_modelViewProjection = VERTEX_nodeVar21;

	// result

	varyings.builtinClipSpace = VERTEX_v_modelViewProjection;

	return varyings;

}

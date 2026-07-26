// Three.js r185 - Node System

// global
diagnostic( off, derivative_uniformity );


// structs

struct OutputStruct {
	@location( 0 ) color: vec4<f32>
};
var<private> output : OutputStruct;

// uniforms

struct NodeBuffer_968Struct {
	value : array< u32 >
};
@binding( 0 ) @group( 1 )
var<storage, read> NodeBuffer_968 : NodeBuffer_968Struct;

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

// vars
var<private> DiffuseColor : vec4<f32>;
var<private> nodeVar23 : f32;
var<private> nodeVar24 : u32;
var<private> nodeVar25 : u32;
var<private> nodeVar26 : u32;
var<private> nodeVar27 : u32;
var<private> nodeVar28 : f32;
var<private> nodeVar29 : f32;
var<private> Output : vec4<f32>;
var<private> nodeVar30 : vec4<f32>;

// codes


@fragment
fn main( @location( 0 ) @interpolate(flat, either) nodeVarying4 : u32 ) -> OutputStruct {

	// flow
	// code

	nodeVar24 = ( nodeVarying4 * object.nodeUniform12 );
	nodeVar25 = ( ( ( ( ( ( NodeBuffer_968.value[ nodeVar24 ] - 1u ) / object.nodeUniform13 ) + 1u ) + ( object.nodeUniform14 - 1u ) ) / object.nodeUniform14 ) * object.nodeUniform14 );

	if ( ( nodeVar25 > ( ( object.nodeUniform15 - 2u ) * object.nodeUniform14 ) ) ) {

		nodeVar23 = ( f32( object.nodeUniform16 ) - 1.0 );

	} else {

		nodeVar23 = f32( nodeVar25 );

	}

	nodeVar26 = ( ( ( ( nodeVar24 * 64u ) + 505u ) * 747796405u ) + 2891336453u );
	nodeVar27 = ( ( ( nodeVar26 >> ( ( nodeVar26 >> 28u ) + 4u ) ) ^ nodeVar26 ) * 277803737u );
	nodeVar28 = ( ( clamp( ( nodeVar23 / ( f32( object.nodeUniform16 ) - 1.0 ) ), 0.0, 1.0 ) * 0.96 ) + ( ( f32( ( ( nodeVar27 >> 22u ) ^ nodeVar27 ) ) * 2.3283064365386963e-10 ) * 0.04 ) );

	if ( ( NodeBuffer_968.value[ nodeVar24 ] > 0u ) ) {

		nodeVar29 = 1.0;

	} else {

		nodeVar29 = 0.0;

	}

	DiffuseColor = vec4<f32>( ( vec3<f32>( 0.9646862478936612, 0.025186859622305935, 0.036889450395083165 ) * vec3<f32>( 0.9 ) ), ( ( ( 0.9 * smoothstep( nodeVar28, ( nodeVar28 + 0.02 ), object.nodeUniform17 ) ) * ( 1.0 - ( smoothstep( nodeVar28, ( nodeVar28 + 0.2 ), object.nodeUniform17 ) * 0.85 ) ) ) * nodeVar29 ) );
	DiffuseColor.w = ( DiffuseColor.w * object.nodeUniform18 );
	nodeVar30 = max( vec4<f32>( DiffuseColor.xyz, DiffuseColor.w ), vec4<f32>( 0.0 ) );
	Output = nodeVar30;

	// result

	output.color = nodeVar30;

	return output;

}

// Three.js r185 - Node System

// global
diagnostic( off, derivative_uniformity );


// structs

struct OutputStruct {
	@location( 0 ) color: vec4<f32>
};
var<private> output : OutputStruct;

// uniforms

struct objectStruct {
	nodeUniform2 : u32,
	nodeUniform8 : f32,
	nodeUniform9 : f32,
	nodeUniform12 : mat4x4<f32>
};
@binding( 0 ) @group( 1 )
var<uniform> object : objectStruct;

// vars
var<private> DiffuseColor : vec4<f32>;
var<private> Output : vec4<f32>;
var<private> nodeVar20 : vec4<f32>;

// codes


@fragment
fn main( @location( 0 ) nodeVarying3 : vec4<f32> ) -> OutputStruct {

	// flow
	// code

	DiffuseColor = nodeVarying3;
	DiffuseColor.w = ( DiffuseColor.w * object.nodeUniform9 );
	nodeVar20 = max( vec4<f32>( DiffuseColor.xyz, DiffuseColor.w ), vec4<f32>( 0.0 ) );
	Output = nodeVar20;

	// result

	output.color = nodeVar20;

	return output;

}

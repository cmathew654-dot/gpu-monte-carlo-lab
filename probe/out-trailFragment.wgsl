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
	nodeUniform1 : u32,
	nodeUniform2 : u32,
	nodeUniform3 : u32,
	nodeUniform4 : u32,
	nodeUniform5 : u32,
	nodeUniform7 : u32,
	nodeUniform8 : u32,
	nodeUniform9 : u32,
	nodeUniform11 : u32,
	nodeUniform15 : f32,
	nodeUniform16 : f32,
	nodeUniform17 : f32,
	nodeUniform18 : f32,
	nodeUniform21 : mat4x4<f32>
};
@binding( 0 ) @group( 1 )
var<uniform> object : objectStruct;

// vars
var<private> DiffuseColor : vec4<f32>;
var<private> Output : vec4<f32>;
var<private> nodeVar44 : vec4<f32>;

// codes


@fragment
fn main( @location( 0 ) nodeVarying3 : vec4<f32> ) -> OutputStruct {

	// flow
	// code

	DiffuseColor = nodeVarying3;
	DiffuseColor.w = ( DiffuseColor.w * object.nodeUniform18 );
	nodeVar44 = max( vec4<f32>( DiffuseColor.xyz, DiffuseColor.w ), vec4<f32>( 0.0 ) );
	Output = nodeVar44;

	// result

	output.color = nodeVar44;

	return output;

}
